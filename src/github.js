/***** SETUP *****/

// Necessary packages
const http = require('http');
const fs = require('fs');
const Rx = require('rx');
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

//Type of API call
const ALLEVENTS = 'all';
const ONEEVENT = 'one';

// Variables kept up to date by server
var allevents = [];
var nextGithubRequestAt;
var etag;

// Creates the basic server, above per request, below per server
http.createServer((req, res) => {
    logger(0, 'Request received from client');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    
    APIInfo = getAPIInfo(req.url);
    logger(9, 'APIInfo received');
    
    if(APIInfo.error) {
        res.end(APIInfo);
    } else {
        filterEvents(APIInfo, res);
    }
}).listen(port, hostname, () => {
    logger(0, `Server running at http://${hostname}:${port}/`);
    
    nextGithubRequestAt = Date.now();
    
    startGithubConnection();    
});

/***** FUNCTIONS EXECUTED PER REQUEST *****/

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
    
    const indexCallEnd = path.indexOf('/', indexPartEnd+1);
    const call = path.substr(indexPartEnd+1, indexCallEnd-indexPartEnd-1);
    
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
        return {error: "The API-call went wrong, because there was no 'all' or 'one'. It should be: /[part]/all/[regexp] or /[part]/one/[eventType]/[regexp]."};
    }
    
    logger(8, 'APIInfo APICall = ' + APICall);
    logger(8, 'APIInfo APIEvent = ' + APIEvent);
    logger(8, 'APIInfo custom: ' + custom);
    logger(8, 'APIInfo standard: ' + standard);
    
    var regexp = getRegexp(regexpstr)
    
    return {
        custom: custom,
        standard: standard,
        APICall: APICall,
        APIEvent: APIEvent,
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
function filterEvents(APIInfo, res) {
    // hard copy for filtering
    var events = JSON.parse(JSON.stringify(allevents));
    
    if(APIInfo.APICall === ONEEVENT) {
        logger(8, 'Filtering on one event');
        events = events.
            filter(function(event) {
                return event.type === APIInfo.APIEvent;
            });
    } else {
        logger(8, 'Searching through all events');
    }
    
    filterOnRegexp(events, APIInfo, res);
}

// Filters the events based on the regular expression
function filterOnRegexp(events, APIInfo, res) {
    logger(9, 'filteronregexp');
    var results = [];
    var matches = 0;
    var nonmatches = 0;
    
    regexp = APIInfo.regexp;
    
    events.
        forEach(function(event) {
            var matched = false;
            
            if(event.payload) {
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
                        // result = regexp.test(event.payload.repository.full_name);  // resulted in an error
                        // matched = matched || result;
                        logger(0, 'Unsupported (for now)');
                        logger(0, event);
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
            } else {
                logger(0, 'Event had no payload'); 
                logger(0, event);
            }
             
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
    
    res.end(JSON.stringify(results, null, '  '));
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
    
    const nextRequestIn = Math.max(pollinterval/1000, (rateReset - now) / rateRemaining);
    
    nextGithubRequestAt = now + nextRequestIn;
    
    const nextDate = new Date(nextGithubRequestAt);
    
    logger(8, 'x-poll-interval: ' + pollinterval);
    logger(8, 'x-ratelimit-limit: ' + headers['x-ratelimit-limit']);
    logger(8, 'x-ratelimit-remaining: ' + rateRemaining);
    logger(8, 'x-ratelimit-reset: ' + rateReset.toUTCString()  + ' (UTC)');
    logger(8, 'calculated next request in: ' + nextRequestIn  + ' ms');
    
    logger(4, 'next github request at: ' + nextDate.toUTCString()  + ' (UTC)');
}

/***** UTILITY FUNCTIONS *****/

// Simple logger function based on the selected level.
function logger(level, str) {
    if(loggingLevel >= level) {
        console.log(str);
    }
}