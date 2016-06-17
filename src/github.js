const http = require('http');
const fs = require('fs');
const Rx = require('rx');
const DOM = require('rx-dom');
const RxNode = require('rx-node');
const request = require('request');
const run = require('gen-run');

const hostname = '127.0.0.1';
const port = 1337;

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
    console.log('request received from client');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    
    APIInfo = getAPIInfo(req.url);
    console.log('APIInfo received');
    
    filterEvents(APIInfo, res);
}).listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
    
    nextGithubRequestAt = Date.now();
    
    startGithubConnection();    
});

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
    
    console.log('part = ' + part);
    
    const indexCallEnd = path.indexOf('/', indexPartEnd+1);
    const call = path.substr(indexPartEnd+1, indexCallEnd-indexPartEnd-1);
    
    if(call === ALLEVENTS) {
        APICall = ALLEVENTS;
        console.log('apicall = ' + APICall);
        regexpstr = path.substr(indexCallEnd+1);
    } else if (call === ONEEVENT) {
        APICall = ONEEVENT;
        const indexEventEnd = path.indexOf('/', index+1);
        APIEvent = path.substr(indexCallEnd+1, indexEventEnd-indexCallEnd-1);
        
        console.log('path = ' + path);
        console.log('index = ' + index);
        console.log('index2 = ' + index2);
        console.log('apicall = ' + APICall);
        console.log('apievent = ' + APIEvent);
        
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
    
    console.log('regexp = ' + regexpstr);
    
    return regexp;
}

function startGithubConnection() {
    console.log('trying to make connection to github...');
    
    options = getOptions();
    
    nextGithubRequest(options);
}

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

function nextGithubRequest(options) {
    var data = [];
    
    run(function* (gen) {
        const sleepFor = Math.max(0, nextGithubRequestAt - Date.now());
        
        yield setTimeout(gen(), sleepFor);
        
        request.
            get(options).
            on('error', function(err) {
                if(err.code === 'ETIMEDOUT') {
                    console.log('timeout at github');
                } else {
                    console.log('error occurred at github: ' + err);
                }
            }).
            on('response', function(response) {
                if(response.statusCode === 200) {
                    console.log('github status code correct (' + response.statusCode + ')');
                } else {
                    console.log('incorrect github status code: ' + response.statusCode);
                }
                
                getNextGithubRequestAt(response.headers);
                etag = response.headers['etag'];
            }).
            on('data', function(chunk) {
                //console.log('received data');
                data += chunk;
            }).
            on('end', function() {
                var newevents = JSON.parse(data);
                allevents = allevents.concat(newevents);
                console.log('-----end of data-----');
                
                options = getOptions();
                //nextGithubRequest(options);
            });
        console.log('request sent to Github');
    });
}

function getNextGithubRequestAt(headers) {
    const pollinterval = headers['x-poll-interval']; // in seconds
            
    const rateRemaining = headers['x-ratelimit-remaining']; // until rateReset
    const rateReset = new Date(headers['x-ratelimit-reset'] * 1000); // in ms
    const now = Date.now();
    
    const ratePerMs = Math.max(pollinterval/1000, (rateReset - now) / rateRemaining);
    
    nextGithubRequestAt = now + ratePerMs;
    
    //console.log('next github request at: ' + nextGithubRequestAt.toUTCString()  + ' (UTC)');
}

function filterEvents(APIInfo, res) {
    //hard copy for filtering
    var events = JSON.parse(JSON.stringify(allevents));
    
    if(APIInfo.APICall === ONEEVENT) {
        console.log('going');
        events = events.
            filter(function(event) {
                return event.type === APIInfo.APIEvent;
            });
    }
    
    filterOnRegexp(events, APIInfo, res);
}

function filterOnRegexp(events, APIInfo, res) {
    console.log('filteronregexp');
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
                    console.log('Event type not used: ' + event.type);
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
                console.log('match');
                results.push(event);
            } else {
                console.log('no match');
            }
        });
    
    res.end(JSON.stringify(results, null, '  '));
}
