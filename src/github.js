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
const loggingLevel = 8; // 0 = nothing, 4 = some, 9 = all
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
var realtimestream;
var realtimesubject;

// Creates the basic server, above per request, below per server
http.createServer((req, res) => {
    logger(0, 'Request received from client');
    
    const url = req.url.substr(1);
    const indexRealtimeEnd = url.indexOf('/');
    const firstparturl = url.substr(0, indexRealtimeEnd);
    
    if(url === 'ui') {
        // For request via the UI
        fs.readFile('github.html', "binary", function(err, file) {
            if(err) {
                res.writeHead(500, {"Content-Type": "text/plain"});
                res.write(err + "\n");
                res.end();
                return;
            }
            res.writeHead(200);
            res.write(file, "binary");
        });
    } if(firstparturl === 'realtime') {
        // For real-time request via the API
        APIInfo = getAPIInfo(req.url.substr(indexRealtimeEnd+1));
        logger(9, 'APIInfo for real-time received');
        
        if(APIInfo.error) {
            res.writeHead(500, {"Content-Type": "text/plain"});
            res.end(JSON.stringify(APIInfo, null, '  '));
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain'});
            var subscription = realtime(APIInfo, res);
            
            run(function* (gen) {
                // Sleep until next allowed request at github
                const sleepFor = 10 * 1000;
                yield setTimeout(gen(), sleepFor);
                logger(0, '>>>>> Time is over');
                subscription.unsubscribe();
                endSubscription(res);
            });
        }
    } else {
        // For request via the API
        APIInfo = getAPIInfo(req.url);
        logger(9, 'APIInfo received');
        
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
    logger(0, '>>>>> Created real time subject to follow');
    
    nextGithubRequestAt = Date.now();
    
    startGithubConnection();
});

/***** FUNCTIONS EXECUTED FOR REAL-TIME RESULTS *****/

function realtime(APIInfo, res) {
    // Bad that some code is copied, good that its in one stream.
    logger(8, '>>>>> realtime started');
    var first = true;
    
    res.write('[');
    
    var subscription = realtimesubject.subscribe(
        function(events) {  
            logger(4, '>>>>> events received in subscription');
            events.
                filter(function(event) {
                    logger(9, '>>>>> filter1');
                    if(APIInfo.APICall === ONEEVENT) {
                        return event.type === APIInfo.APIEvent;
                    } else {
                        return true;
                    }
                }).
                filter(function(event) {
                    logger(9, '>>>>> filter2');
                    return matchEvent(event, APIInfo);
                }).
                map(function(event) {
                    if(APIInfo.onlyId) {
                        return event.id;
                    } else {
                        return event;
                    }
                }).
                forEach(function(event) {
                    logger(9, '>>>>> print');
                    printEvent(event, res, first);
                    first = false;
                }); 
        },
        function(error) { 
            logger(0, '>>>>> ERROR in realtime: ' + error.message);
        },
        function() { 
            endSubscription(res);
        }
    );
    
    logger(8, '>>>>> subscription started');
    
    return subscription;
}

function endSubscription(res) {
    logger(4, '>>>>> Realtime request complete');
    res.end(']');
}

function printEvent(event, res, first) {
    if(!first) { 
        res.write(',');
    }
    res.write(JSON.stringify(event, null, '  '));
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
        logger(0, 'Error in part: ' + part);
        return {error: "The API-part went wrong, because it was not 'custom', 'payload' (these two are the same), 'standard' or 'both'. It should be: /[part]/all/[regexp] or /[part]/one/[eventType]/[regexp]."};
    }
    
    const indexIdEnd = path.indexOf('/', indexPartEnd+1);
    const id = path.substr(indexPartEnd+1, indexIdEnd-indexPartEnd-1);
    
    if(id === 'id') {
        onlyId = true;
    } else if(id === 'complete') {
        onlyId = false;
    } else {
        logger(0, 'Error in onlyId: ' + id);
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
        logger(0, 'Error in event call: ' + call);
        return {error: "The API-call went wrong, because there was no 'all' or 'one'. It should be: " + apicallstring + "."};
    }
    
    logger(8, 'APIInfo APICall = ' + APICall);
    logger(8, 'APIInfo APIEvent = ' + APIEvent);
    logger(8, 'APIInfo custom: ' + custom);
    logger(8, 'APIInfo standard: ' + standard);
    logger(8, 'APIInfo only id: ' + onlyId);
    
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
    
    logger(8, 'APIinforegexp = ' + regexpstr);
    
    return regexp;
}

// Filters the event stream so that 
// 1) a hard copy is available for filtering etc. and 
// 2) only events of the correct type are there
function filterEventsHardCopy(APIInfo, res) {
    // hard copy for filtering (non real-time because of this).
    var events = JSON.parse(JSON.stringify(allevents));
    
    var filteredEvents = filterEvents(APIInfo, events);
    
    filterOnRegexp(filteredEvents, APIInfo, res);
}

// Filters the event stream so that 
// 2) only events of the correct type are there
function filterEvents(APIInfo, events) {
    if(APIInfo.APICall === ONEEVENT) {
        logger(8, 'Filtering on one event');
        events = events.
            filter(function(event) {
                return event.type === APIInfo.APIEvent;
            });
    } else {
        logger(8, 'Searching through all events');
    }
    
    return events;
}

// Filters the events based on the regular expression
function filterOnRegexp(events, APIInfo, res) {
    logger(9, 'filteronregexp');
    var results = [];
    var matches = 0;
    var nonmatches = 0;
    
    events.
        forEach(function(event) {
            var matched = matchEvent(event, APIInfo);
             
            // If this event is matched, add it to results
            if(matched) {
                logger(9, 'match');
                matches++;
                results.push(event);
            } else {
                logger(9, 'no match');
                nonmatches++;
            }
        });
    
    logger(4, 'Amount of matches: ' + matches);
    logger(4, 'Amount of nonmatches: ' + nonmatches);
    
    if(APIInfo.onlyId) {
        results = results.
            map(function(event) {
                return event.id;            
            });
    } else {
        //Do nothing.
    }
    
    res.end(JSON.stringify(results, null, '  '));
}

// Returns if an event is matched with the given APIInfo
function matchEvent(event, APIInfo) {
    var matched = false;
    var regexp = APIInfo.regexp;
            
    if(!event.payload || JSON.stringify(event.payload) == '{}'){
        logger(8, 'Event had no payload'); 
        logger(8, event);
    } else {
        // API call is for custom (payload) part
        if(APIInfo.custom) {
            logger(9, 'Searching through custom...'); 
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
                logger(0, 'This event should not be visible in timelines');
            } else if(event.type === 'DeploymentStatusEvent') {
                //Events of this type are not visible in timelines.
                logger(0, 'This event should not be visible in timelines');
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
                logger(0, 'This event should not be visible in timelines');
            } else if(event.type === 'PageBuildEvent') {
                //Events of this type are not visible in timelines.
                logger(0, 'This event should not be visible in timelines');
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
                logger(0, 'This event should not be visible in timelines');
            } else if(event.type === 'TeamAddEvent') {
                //Events of this type are not visible in timelines.
                logger(0, 'This event should not be visible in timelines');
            } else if(event.type === 'WatchEvent') {
                result = regexp.test(event.payload.action);
                matched = matched || result;
            } else {
                logger(0, 'Event type not used: ' + event.type);
            }
        }
        
        // API call is for standard part
        if(APIInfo.standard) {
            //hard copy
            logger(9, 'Searching through standard...'); 
            const eventWithoutPayload = JSON.parse(JSON.stringify(event));
            delete eventWithoutPayload.payload;
            result = regexp.test(JSON.stringify(eventWithoutPayload));
            matched = matched || result;
        }
    }
    
    return matched;
}

/***** FUNCTIONS EXECUTED PER SERVER *****/

// Starts the connection to Github.
function startGithubConnection() {
    logger(8, 'trying to make connection to github...');
    
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
                    logger(0, 'timeout at github');
                } else {
                    logger(0, 'error occurred at github: ' + err);
                }
            }).
            on('response', function(response) {
                if(response.statusCode === 200) {
                    logger(1, 'github status code correct (' + response.statusCode + ')');
                } else if(response.statusCode === 304) {
                    logger(0, 'not modified since last request');
                } else {
                    logger(0, 'incorrect github status code: ' + response.statusCode);
                }
                
                getNextGithubRequestAt(response.headers);
                etag = response.headers['etag'];
            }).
            on('data', function(chunk) {
                logger(9, 'received data');
                data += chunk;
            }).
            on('end', function() {
                var newevents = JSON.parse(data);
                allevents = allevents.concat(newevents);
                
                realtimesubject.next(newevents);
                
                logger(8, '-----end of data-----');
                
                options = getOptions();
                nextGithubRequest(options);
            });
        logger(4, 'request sent to Github');
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
        logger(7, 'first');
    } else {
        const calculation = (rateReset - now) / rateRemaining;
        nextRequestIn = Math.max(pollinterval/1000, calculation);
        if(nextRequestIn < 1) { // In case of error, etc.
            nextRequestIn = 10 * 1000; // Wait 10 seconds
        }
        logger(7, 'second');
    }
    
    nextGithubRequestAt = now + nextRequestIn;
    
    const nextDate = new Date(nextGithubRequestAt);
    
    logger(7, 'x-poll-interval: ' + pollinterval);
    logger(7, 'x-ratelimit-limit: ' + headers['x-ratelimit-limit']);
    logger(7, 'x-ratelimit-remaining: ' + rateRemaining);
    logger(7, 'x-ratelimit-reset: ' + rateReset.toUTCString()  + ' (UTC)');
    logger(7, 'calculated next request in: ' + nextRequestIn  + ' ms');
    
    logger(4, 'next github request at: ' + nextDate.toUTCString()  + ' (UTC)');
}

/***** UTILITY FUNCTIONS *****/

// Simple logger function based on the selected level.
function logger(level, str) {
    if(loggingLevel >= level) {
        console.log(str);
    }
}