/***** SETUP *****/

// Necessary packages
const http = require('http');
const fs = require('fs');
const Rx = require('rxjs');
const DOM = require('rx-dom');
const RxNode = require('rx-node');
const request = require('request');
const run = require('gen-run');

// Setup variables
const hostname = '127.0.0.1';
const port = 1337;
const loggingLevel = 4; // 0 = (almost) nothing, 2 = most important things, 4 = some, 6 = everything except loop-like-things, 8 = all
const eventsURL = 'https://api.github.com/events?per_page=100';
//const eventsURL = 'https://api.github.com/users/rdroog/events/public?per_page=100';
const timeout = 5000;
const apicallstring = "/[{custom,payload,standard,both}]/[{id,complete}]/all/[regexp] or /[{custom,payload,standard,both}]/[{id,complete}]/one/[eventType]/[regexp]";

//Type of API call
const ALLEVENTS = 'all';
const ONEEVENT = 'one';

// Variables kept up to date by server
var allevents = [];
var nextGithubRequestAt;
var etag;

// For real-time
var realtimesubject;
var minRealtime = 1 * 1000; // 1 second
var maxRealtime = 24 * 60 * 60 * 1000; // 1 day

// Creates the basic server, above per request, below per server
http.createServer((req, res) => {
    logger(2, 'Request received from client');
    
    const url = req.url.substr(1);
    const indexRealtimeEnd = url.indexOf('/');
    const firstparturl = url.substr(0, indexRealtimeEnd);
    
    if(url === 'ui') {
        // For request via the UI
        fs.readFile('github.html', "binary", function(err, file) {
            if(err) {
                logger(0, 'Error when reading UI: ' + err);
                res.writeHead(500, {"Content-Type": "text/plain"});
                res.write(err + "\n");
                res.end();
                return;
            }
            logger(2, 'UI loaded');
            res.writeHead(200);
            res.write(file, "binary");
            res.end();
        });
    } else if(firstparturl === 'realtime') {
        // For real-time request via the API
        const indexTimeEnd = url.indexOf('/', indexRealtimeEnd+1);
        const time = url.substr(indexRealtimeEnd+1, indexTimeEnd-indexRealtimeEnd-1);
        
        APIInfo = getAPIInfo(req.url.substr(indexTimeEnd+1));
        logger(6, 'APIInfo for real-time received');
        
        if(APIInfo.error) {
            res.writeHead(500, {"Content-Type": "text/plain"});
            res.end(JSON.stringify(APIInfo, null, '  '));
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain'});
            var subscription = realtime(APIInfo, res);
            
            run(function* (gen) {
                var sleepFor = Math.max(minRealtime, Math.min(time, maxRealtime));
                logger(4, 'Duration of realtime subscription: ' + sleepFor + 'ms');
                yield setTimeout(gen(), sleepFor);
                logger(4, 'Realtime subscription time ended');
                subscription.unsubscribe();
                endSubscription(res);
            });
        }
    } else {
        // For request via the API
        APIInfo = getAPIInfo(req.url);
        logger(6, 'APIInfo for non-real-time received');
        
        if(APIInfo.error) {
            res.writeHead(500, {"Content-Type": "text/plain"});
            res.end(JSON.stringify(APIInfo, null, '  '));
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain'});
            filterEventsHardCopy(APIInfo, res);
        }
    }
}).listen(port, hostname, () => {
    logger(0, `Server running at http://${hostname}:${port}/`);
    
    realtimesubject = new Rx.ReplaySubject();
    
    nextGithubRequestAt = Date.now();
    
    startGithubConnection();
});

/***** FUNCTIONS EXECUTED FOR REAL-TIME RESULTS *****/

function realtime(APIInfo, res) {
    // Bad that some code is copied, good that its in one stream.
    logger(2, 'Real-time request started');
    var first = true;
    
    res.write('[');
    
    var subscription = realtimesubject.subscribe(
        function(events) {  
            logger(6, 'Events in real-time request received');
            events.
                filter(function(event) {
                    logger(8, 'First filter in received events (realtime)');
                    if(APIInfo.APICall === ONEEVENT) {
                        return event.type === APIInfo.APIEvent;
                    } else {
                        return true;
                    }
                }).
                filter(function(event) {
                    logger(8, 'Second filter in received events (realtime)');
                    return matchEvent(event, APIInfo);
                }).
                map(function(event) {
                    logger(8, 'Map in received events (realtime)');
                    if(APIInfo.onlyId) {
                        return event.id;
                    } else {
                        return event;
                    }
                }).
                forEach(function(event) {
                    logger(8, 'Print received events (realtime)');
                    printEvent(event, res, first);
                    first = false;
                }); 
        },
        function(error) { 
            logger(0, 'ERROR in real-time request: ' + error.message);
        },
        function() { 
            endSubscription(res);
        }
    );
    
    logger(6, 'Subscription for real-time request started');
    
    return subscription;
}

function endSubscription(res) {
    logger(2, 'Real-time request complete');
    res.end(']');
}

function printEvent(event, res, first) {
    if(!first) { 
        res.write(',');
    }
    res.write(JSON.stringify(event, null, '  '));
    logger(8, 'Printed event: ' + event);
}

/***** FUNCTIONS EXECUTED PER NON-REALTIME REQUEST *****/

// Gets all the info from the API call:
// - If either in the custom part, the payload part of both should be search
// - If one or all events should be search
// Links to getRegexp() for the regular expression
function getAPIInfo(url) {
    const path = url.substr(1);
    const indexPartEnd = path.indexOf('/');
    const part = path.substr(0, indexPartEnd);
    var regexpstr;
    
    var custom = false;
    var standard = false;
    var onlyId = false;
    var APICall;
    var APIEvent = "";
    var regexpstr;
    
    // Gets the to be search path
    if(part === 'custom' || part === 'payload') {
        custom = true;
    } else if(part === 'standard') {
        standard = true;
    } else if(part === 'both') {
        custom = true;
        standard = true;
    } else {
        logger(0, 'ERROR in part: ' + part);
        return {error: "The API-part went wrong, because it was not 'custom', 'payload' (these two are the same), 'standard' or 'both'. It should be: /[part]/all/[regexp] or /[part]/one/[eventType]/[regexp]."};
    }
    
    const indexIdEnd = path.indexOf('/', indexPartEnd+1);
    const id = path.substr(indexPartEnd+1, indexIdEnd-indexPartEnd-1);
    
    if(id === 'id') {
        onlyId = true;
    } else if(id === 'complete') {
        onlyId = false;
    } else {
        logger(0, 'ERROR in onlyId: ' + id);
        return {error: "The API-onlyId went wrong, because it was not 'id' or 'complete'. It should be: /[part]/all/[regexp] or /[part]/one/[eventType]/[regexp]."}; //TODO error message
    }
    
    const indexCallEnd = path.indexOf('/', indexIdEnd+1);
    const call = path.substr(indexIdEnd+1, indexCallEnd-indexIdEnd-1);
    
    // Gets if all or one event should be search, and if one, which one.
    if(call === ALLEVENTS) {
        APICall = ALLEVENTS;
        regexpstr = path.substr(indexCallEnd+1);
    } else if (call === ONEEVENT) {
        APICall = ONEEVENT;
        const indexEventEnd = path.indexOf('/', indexCallEnd+1);
        APIEvent = path.substr(indexCallEnd+1, indexEventEnd-indexCallEnd-1);
        
        regexpstr = path.substr(indexEventEnd+1);
    } else {
        logger(0, 'ERROR in event call: ' + call);
        return {error: "The API-call went wrong, because there was no 'all' or 'one'. It should be: " + apicallstring + "."};
    }
    
    logger(6, 'APIInfo APICall = ' + APICall);
    logger(6, 'APIInfo APIEvent = ' + APIEvent);
    logger(6, 'APIInfo custom = ' + custom);
    logger(6, 'APIInfo standard = ' + standard);
    logger(6, 'APIInfo only id = ' + onlyId);
    
    var regexp = getRegexp(regexpstr)
    
    return {
        custom: custom,
        standard: standard,
        APICall: APICall,
        APIEvent: APIEvent,
        onlyId: onlyId,
        regexp: regexp
    };
}

// Gets the regular expression, sets it as insensitive for case
function getRegexp(regexpstr) {
    var regexp = new RegExp(regexpstr, 'i');
    
    logger(6, 'APIinfo regexp = ' + regexpstr);
    
    return regexp;
}

// Filters the event stream so that 
// 1) a hard copy is available for filtering etc. and 
// 2) only events of the correct type are there
function filterEventsHardCopy(APIInfo, res) {
    // hard copy for filtering (non real-time because of this).
    logger(6, 'Created hard copy of events for non-real-time request');
    var events = JSON.parse(JSON.stringify(allevents));
    
    var filteredEvents = filterEvents(APIInfo, events);
    
    filterOnRegexp(filteredEvents, APIInfo, res);
}

// Filters the event stream so that 
// 2) only events of the correct type are there
function filterEvents(APIInfo, events) {
    if(APIInfo.APICall === ONEEVENT) {
        logger(6, 'Filtering on one event');
        events = events.
            filter(function(event) {
                return event.type === APIInfo.APIEvent;
            });
    } else {
        logger(6, 'Searching through all events');
    }
    
    return events;
}

// Filters the events based on the regular expression
function filterOnRegexp(events, APIInfo, res) {
    logger(6, 'Going to filter on the regular expression');
    var results = [];
    var matches = 0;
    var nonmatches = 0;
    
    events.
        forEach(function(event) {
            var matched = matchEvent(event, APIInfo);
             
            // If this event is matched, add it to results
            if(matched) {
                logger(8, 'Event matched!');
                matches++;
                results.push(event);
            } else {
                logger(8, 'Event not matched.');
                nonmatches++;
            }
        });
    
    logger(4, 'Amount of matches: ' + matches);
    logger(4, 'Amount of nonmatches: ' + nonmatches);
    
    if(APIInfo.onlyId) {
        logger(6, 'Returning only the ids of events');
        results = results.
            map(function(event) {
                return event.id;            
            });
    } else {
        logger(6, 'Returning everything from events');
        //Do nothing.
    }
    
    res.end(JSON.stringify(results, null, '  '));
}

// Returns if an event is matched with the given APIInfo
function matchEvent(event, APIInfo) {
    var matched = false;
    var regexp = APIInfo.regexp;
            
    if(!event.payload || JSON.stringify(event.payload) == '{}'){
        logger(2, 'Event had no payload: ' + event);
    } else {
        // API call is for custom (payload) part
        if(APIInfo.custom) {
            logger(8, 'Searching through custom-part...'); 
            //Deprecated events not shown below, non-visible events are, but not used.
            if(event.type === 'CommitCommentEvent' || event.type === 'IssueCommentEvent' || event.type === 'PullRequestReviewCommentEvent') {
                result = regexp.test(event.payload.comment.body);
                matched = matched || result;
            } else if(event.type === 'CreateEvent') {
                result = regexp.test(event.payload.description);
                matched = matched || result;
            } else if(event.type === 'DeleteEvent') {
                result = regexp.test(event.payload.ref) 
                      || regexp.test(event.payload.reftype);
                matched = matched || result;
            } else if(event.type === 'DeploymentEvent') {
                //Events of this type are not visible in timelines.
                logger(0, 'ERROR: this event should not be visible in timelines (1)');
            } else if(event.type === 'DeploymentStatusEvent') {
                //Events of this type are not visible in timelines.
                logger(0, 'ERROR: this event should not be visible in timelines (2)');
            } else if(event.type === 'ForkEvent') {
                result = regexp.test(event.payload.forkee.full_name);
                matched = matched || result;
            } else if(event.type === 'GollumEvent') {
                event.payload.pages.
                    forEach(function(page) {
                        result = regexp.test(page.page_name) 
                              || regexp.test(page.title) 
                              || regexp.test(page.summary);
                        matched = matched || result;
                    });
            } else if(event.type === 'IssuesEvent') {
                result = regexp.test(event.payload.action) 
                      || regexp.test(event.payload.issue.title) 
                      || regexp.test(event.payload.issue.body);
                matched = matched || result;
            } else if(event.type === 'MemberEvent') {
                result = regexp.test(event.payload.action) 
                      || regexp.test(event.payload.member.login);
                matched = matched || result;
            } else if(event.type === 'MembershipEvent') {
                //Events of this type are not visible in timelines.
                logger(0, 'ERROR: this event should not be visible in timelines (3)');
            } else if(event.type === 'PageBuildEvent') {
                //Events of this type are not visible in timelines.
                logger(0, 'ERROR: this event should not be visible in timelines (4)');
            } else if(event.type === 'PublicEvent') {
                result = regexp.test(event.payload.repository.full_name);
                matched = matched || result;
            } else if(event.type === 'PullRequestEvent') {
                result = regexp.test(event.payload.action)
                      || regexp.test(event.payload.pull_request.state) 
                      || regexp.test(event.payload.pull_request.title) 
                      || regexp.test(event.payload.pull_request.body);
                matched = matched || result;
            } else if(event.type === 'PushEvent') {
                event.payload.commits.
                    forEach(function(commit) {
                        result = regexp.test(commit.message);
                        matched = matched || result;
                    });
            } else if(event.type === 'ReleaseEvent') {
                result = regexp.test(event.payload.action)
                      || regexp.test(event.payload.release.name)
                      || regexp.test(event.payload.release.body);
                matched = matched || result;
            } else if(event.type === 'RepositoryEvent') {
                result = regexp.test(event.payload.action)
                      || regexp.test(event.payload.repository.full_name)
                      || regexp.test(event.payload.repository.description);
                matched = matched || result;
            } else if(event.type === 'StatusEvent') {
                //Events of this type are not visible in timelines.
                logger(0, 'ERROR: this event should not be visible in timelines (5)');
            } else if(event.type === 'TeamAddEvent') {
                //Events of this type are not visible in timelines.
                logger(0, 'ERROR: this event should not be visible in timelines (6)');
            } else if(event.type === 'WatchEvent') {
                result = regexp.test(event.payload.action);
                matched = matched || result;
            } else {
                logger(0, 'ERROR: tvent type not used: ' + event.type);
            }
        }
    }
        
    // API call is for standard part
    if(APIInfo.standard) {
        //hard copy
        logger(8, 'Searching through standard-part...'); 
        const eventWithoutPayload = JSON.parse(JSON.stringify(event));
        delete eventWithoutPayload.payload;
        result = regexp.test(JSON.stringify(eventWithoutPayload));
        matched = matched || result;
    }
    
    return matched;
}

/***** FUNCTIONS EXECUTED PER SERVER *****/

// Starts the connection to Github.
function startGithubConnection() {
    logger(2, 'Trying to make connection to GitHub...');
    
    options = getOptions();
    
    nextGithubRequest(options);
}

// Gets the options depending on if etag is known.
function getOptions() {
    var options;
    
    if(etag) {
        options = {
            url: eventsURL,
            timeout: timeout,
            headers: {
                'User-Agent': 'github-events-grep',
                'ETag': etag
            }
        };
    } else {
        options = {
            url: eventsURL,
            timeout: timeout,
            headers: {
                'User-Agent': 'github-events-grep'
            }
        };
    }
    
    return options;
}

// Will poll Github continuously based on its limits
function nextGithubRequest(options) {
    var data = [];
    
    run(function* (gen) {
        // Sleep until next allowed request at github
        const sleepFor = Math.max(0, nextGithubRequestAt - Date.now());
        yield setTimeout(gen(), sleepFor);
        
        request.
            get(options).
            on('error', function(err) {
                if(err.code === 'ETIMEDOUT') {
                    logger(0, 'ERROR: timeout at GitHub');
                } else {
                    logger(0, 'ERROR: occurred at GitHub: ' + err);
                }
            }).
            on('response', function(response) {
                if(response.statusCode === 200) {
                    logger(4, 'GitHub status code correct (' + response.statusCode + ')');
                } else if(response.statusCode === 304) {
                    logger(2, 'No modification since last request');
                } else {
                    logger(0, 'ERROR: GitHub status code: ' + response.statusCode);
                }
                
                getNextGithubRequestAt(response.headers);
                etag = response.headers['etag'];
            }).
            on('data', function(chunk) {
                logger(8, 'Received some data...');
                data += chunk;
            }).
            on('end', function() {
                var newevents = JSON.parse(data);
                allevents = allevents.concat(newevents);
                
                realtimesubject.next(newevents);
                
                logger(6, 'Data stream ended');
                
                options = getOptions();
                nextGithubRequest(options);
            });
        logger(2, 'Request sent to Github');
    });
}

// Calculates when the server should ask Github again for more information.
// Based on both the x-poll-interval option and x-ratelimit options.
function getNextGithubRequestAt(headers) {
    const pollinterval = headers['x-poll-interval']; // in seconds
            
    const rateRemaining = headers['x-ratelimit-remaining']; // rate amount left until rateReset
    const rateReset = new Date(headers['x-ratelimit-reset'] * 1000); // in ms
    const now = Date.now();
    
    var nextRequestIn;
    
    if(rateRemaining <= 1) {
        nextRequestIn = rateReset - now + 1 * 10000; // Try again 10 seconds after reset
        logger(2, 'Remaining rate too low');
    } else {
        const calculation = (rateReset - now) / rateRemaining;
        nextRequestIn = Math.max(pollinterval/1000, calculation);
        if(nextRequestIn < 1) { // In case of error, etc.
            nextRequestIn = 10 * 1000; // Wait 10 seconds
        }
        logger(6, 'Remaining rate is okay');
    }
    
    nextGithubRequestAt = now + nextRequestIn;
    
    const nextDate = new Date(nextGithubRequestAt);
    
    logger(6, 'x-poll-interval: ' + pollinterval);
    logger(6, 'x-ratelimit-limit: ' + headers['x-ratelimit-limit']);
    logger(6, 'x-ratelimit-remaining: ' + rateRemaining);
    logger(6, 'x-ratelimit-reset: ' + dateToStr(rateReset)  + ' (UTC)');
    logger(6, 'Calculated next request in: ' + nextRequestIn  + ' ms');
    
    logger(2, 'Next GitHub request at: ' + dateToStr(nextDate)  + ' (UTC)');
}

/***** UTILITY FUNCTIONS *****/

// Simple logger function based on the selected level.
function logger(level, str) {
    if(loggingLevel >= level) {
        const now = new Date(Date.now());
        const nowstr = dateToStr(now);
        console.log(nowstr + ': ' + str);
    }
}

// One time-format for the whole library.
function dateToStr(date) {
    var month = leftpad2(date.getMonth() + 1);  // getMonth() is zero based
    var day = leftpad2(date.getDate());
    var hours = leftpad2(date.getHours());
    var minutes = leftpad2(date.getMinutes());
    var seconds = leftpad2(date.getSeconds());
    var ymd = date.getFullYear() + '-' + month + '-' + day;
    var hms = hours + ':' + minutes + ':' + seconds;
    var str = ymd + '  ' + hms + ' ' + date.getMilliseconds() + 'ms';

    return str;
}

// Leftpad function for numbers of length up to 2, to length of 2
function leftpad2(n) {
    if(n < 10) {
        str = '0' + n;
    } else {
        str = n;
    }
    return str;
}

// Leftpad function for ms to length of 4
function leftpadms(n) {
    if(n < 10) {
        str = '   ' + n;
    } else if(n < 100) {
        str = '  ' + n;
    } else if(n < 1000) {
        str = ' ' + n;
    } else {
        str = n;
    }
    return str;
}