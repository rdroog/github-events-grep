const http = require('http');
const fs = require('fs');
const Rx = require('rx');
const DOM = require('rx-dom');
const RxNode = require('rx-node');
const request = require('request');

const hostname = '127.0.0.1';
const port = 1337;

/* Parts on which the call should be executed*/
var custom = false;
var standard = false;

/* Type of API call */
var APICall;
const ALLEVENTS = 'all';
const ONEEVENT = 'one';
// Only used if the API call is one event.
var APIEvent;

http.createServer((req, res) => {
    console.log('request received from client');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    
    regexpstr = getAPICall(req.url);
    regexp = getRegexp(regexpstr);
    
    makeGithubConnection(regexp, res);
    //res.end(results);
}).listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});

function getAPICall(url) {
    const path = url.substr(1);
    const indexPartEnd = path.indexOf('/');
    const part = path.substr(0, indexPartEnd);
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
    
    return regexpstr;
}

function getRegexp(regexpstr) {
    var regexp = new RegExp(regexpstr, 'i');
    
    console.log('regexp = ' + regexpstr);
    
    return regexp;
}

function makeGithubConnection(regexp, res) {
    console.log('trying to make connection to github...');
    const options = {
        url: 'https://api.github.com/users/rdroog/events/public',
        //url: 'https://api.github.com/events',
        timeout: 5000,
        headers: {
            'User-Agent': 'github-events-grep'
        }
    };
    
    var data = [];
    
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
        }).
        on('data', function(chunk) {
            console.log('received data');
            data += chunk;
        }).
        on('end', function() {
            filterEvents(data, regexp, res);
            console.log('-----end of data-----');
        });
    console.log('request sent to Github');
}

function filterEvents(data, regexp, res) {
    var events = JSON.parse(data);
    
    if(APICall === ONEEVENT) {
        console.log('going');
        events = events.
            filter(function(event) {
                return event.type === APIEvent;
            });
    }
    
    filterOnRegexp(events, regexp, res);
}

function filterOnRegexp(events, regexp, res) {
    console.log('filteronregexp');
    var results = [];
    
    if(standard) {
        //TODO
    }
    
    if(custom) {
        events.
            forEach(function(event) {
                var matched = false;
                
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
                
                if(matched) {
                    console.log('match');
                    results.push(event);
                } else {
                    console.log('no match');
                }
            });
    }
    res.end(JSON.stringify(results, null, '  '));
}
