const http = require('http');
const fs = require('fs');
const Rx = require('rx');
const DOM = require('rx-dom');
const RxNode = require('rx-node');
const request = require('request');
const run = require('gen-run');

const hostname = '127.0.0.1';
const port = 1337;

const loggingLevel = 9; // 0 = nothing, 4 = some, 9 = all

/* Deprecated because otherwise it cannot handle more than 1 request concurrently. */
/* Parts on which the call should be executed*/
//var custom = false;
//var standard = false;
// Only used if the API call is one event.
//var APIEvent;

/* Type of API call */
//var APICall;
const ALLEVENTS = 'all';
const ONEEVENT = 'one';

var allevents = [];
var nextGithubRequestAt;
var etag;

const eventsURL = 'https://api.github.com/events?per_page=100';
//const eventsURL = 'https://api.github.com/users/rdroog/events/public?per_page=100';
const timeout = 5000;

http.createServer((req, res) => {
    logger(0, 'request received from client');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    
    APIInfo = getAPIInfo(req.url);
    logger(9, 'APIInfo received');
    
    filterEvents(APIInfo, res);
}).listen(port, hostname, () => {
    logger(0, `Server running at http://${hostname}:${port}/`);
    
    nextGithubRequestAt = Date.now();
    
    startGithubConnection();    
});

/* FUNCTIONS EXECUTED PER REQUEST */

function getAPIInfo(url) {
    const path = url.substr(1);
    const indexPartEnd = path.indexOf('/');
    const part = path.substr(0, indexPartEnd);
    var regexpstr;
    
    
    var custom;
    var standard;
    var APICall;
    var APIEvent = "";
    var regexpstr;
    
    if(part === 'custom' || part === 'payload') {
        custom = true;
    } else if(part === 'standard') {
        standard = true;
    } else {
        custom = true;
        standard = true;
    }
    
    logger(9, 'part = ' + part);
    
    const indexCallEnd = path.indexOf('/', indexPartEnd+1);
    const call = path.substr(indexPartEnd+1, indexCallEnd-indexPartEnd-1);
    
    if(call === ALLEVENTS) {
        APICall = ALLEVENTS;
        logger(9, 'apicall = ' + APICall);
        regexpstr = path.substr(indexCallEnd+1);
    } else if (call === ONEEVENT) {
        APICall = ONEEVENT;
        const indexEventEnd = path.indexOf('/', index+1);
        APIEvent = path.substr(indexCallEnd+1, indexEventEnd-indexCallEnd-1);
        
        logger(9, 'path = ' + path);
        logger(9, 'index = ' + index);
        logger(9, 'index2 = ' + index2);
        logger(9, 'apicall = ' + APICall);
        logger(9, 'apievent = ' + APIEvent);
        
        regexpstr = path.substr(indexEventEnd+1);
    } else {
        //TODO: error
    }
    
    var regexp = getRegexp(regexpstr)
    
    return {
        custom: custom,
        standard: standard,
        APICall: APICall,
        APIEvent: APIEvent,
        regexp: regexp
    };
}

function getRegexp(regexpstr) {
    var regexp = new RegExp(regexpstr, 'i');
    
    logger(9, 'regexp = ' + regexpstr);
    
    return regexp;
}

function filterEvents(APIInfo, res) {
    //hard copy for filtering
    var events = JSON.parse(JSON.stringify(allevents));
    
    if(APIInfo.APICall === ONEEVENT) {
        logger(9, 'going');
        events = events.
            filter(function(event) {
                return event.type === APIInfo.APIEvent;
            });
    }
    
    filterOnRegexp(events, APIInfo, res);
}

function filterOnRegexp(events, APIInfo, res) {
    logger(9, 'filteronregexp');
    var results = [];
    
    regexp = APIInfo.regexp;
    
    events.
        forEach(function(event) {
            var matched = false;
            
            // API call is for custom (payload) part
            if(APIInfo.custom) {
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
                } else if(event.type === 'DeploymentStatusEvent') {
                    //Events of this type are not visible in timelines.
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
                } else if(event.type === 'PageBuildEvent') {
                    //Events of this type are not visible in timelines.
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
                } else if(event.type === 'TeamAddEvent') {
                    //Events of this type are not visible in timelines.
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
                const eventWithoutPayload = JSON.parse(JSON.stringify(event));
                delete eventWithoutPayload.payload;
                result = regexp.test(eventWithoutPayload);
                matched = matched || result;
            }
             
            // If this event is matched, add it to results
            if(matched) {
                logger(9, 'match');
                results.push(event);
            } else {
                logger(9, 'no match');
            }
        });
    
    res.end(JSON.stringify(results, null, '  '));
}

/* FUNCTIONS EXECUTED PER SERVER */

// Starts the connection to Github.
function startGithubConnection() {
    logger(9, 'trying to make connection to github...');
    
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
                logger(9, '-----end of data-----');
                
                options = getOptions();
                //nextGithubRequest(options);
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
    
    const ratePerMs = Math.max(pollinterval/1000, (rateReset - now) / rateRemaining);
    
    nextGithubRequestAt = now + ratePerMs;
    
    const nextDate = new Date(nextGithubRequestAt);
    
    logger(9, 'next github request at: ' + nextDate.toUTCString()  + ' (UTC)');
}


function logger(level, str) {
    if(loggingLevel >= level) {
        console.log(str);
    }
}