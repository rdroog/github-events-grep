const http = require('http');
const fs = require('fs');
const Rx = require('rx');
const DOM = require('rx-dom');
const RxNode = require('rx-node');
const request = require('request');

const hostname = '127.0.0.1';
const port = 1337;


http.createServer((req, res) => {
    console.log('server started');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    var regexp = new RegExp(req.url.substr(1));
    var results = makeGithubConnection(regexp, res);
    //res.end(results);
}).listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});

function makeGithubConnection(regexp, res) {
    console.log('trying to make connection to github...');
    const options = {
        //url: 'https://api.github.com/users/rdroog/events/public',
        url: 'https://api.github.com/events',
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
                console.log('github status code correct');
            } else {
                console.log('incorrect github status code: ' + response.statusCode);
            }
        }).
        on('data', function(chunk) {
            console.log('received data');
            data += chunk;
        }).
        on('end', function() {
            filterOnRegexp(data, regexp, res);
            console.log('-----end of data-----');
        });
    console.log('request send');
}

function filterOnRegexp(data, regexp, res) {
    console.log('filteronregexp');
    var results = [];
    const events = JSON.parse(data);
    
    var stream = events.
        forEach(function(event) {
            var matched = false;
            
            if(event.type === 'CommitCommentEvent' || event.type === 'IssueCommentEvent' || event.type === 'PullRequestReviewCommentEvent') {
                matched = matched || regexp.test(event.payload.comment.body);
            } else if(event.type === 'CreateEvent') {
                matched = matched || regexp.test(event.payload.description);
            } else if(event.type === 'DeleteEvent') {
                ;
            } else if(event.type === 'DeploymentEvent') {
                ;
            } else if(event.type === 'DeploymentStatusEvent') {
                ;
            } else if(event.type === 'ForkEvent') {
                ;
            } else if(event.type === 'GollumEvent') {
                event.payload.pages.
                    forEach(function(page) {
                        matched = matched || regexp.test(page.summary);
                    });
            } else if(event.type === 'IssuesEvent') {
                matched = matched || regexp.test(event.payload.action);
            } else if(event.type === 'MemberEvent') {
                ;
            } else if(event.type === 'MembershipEvent') {
                ;
            } else if(event.type === 'PageBuildEvent') {
                ;
            } else if(event.type === 'PublicEvent') {
                ;
            } else if(event.type === 'PullRequestEvent') {
                ;
            } else if(event.type === 'PushEvent') {
                event.payload.commits.
                    forEach(function(commit) {
                        matched = matched || regexp.test(commit.message);
                    });
            } else if(event.type === 'ReleaseEvent') {
                ;
            } else if(event.type === 'RepositoryEvent') {
                ;
            } else if(event.type === 'TeamAddEvent') {
                ;
            } else if(event.type === 'WatchEvent') {
                ;
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
    
    res.end(JSON.stringify(results, null, '  '));
}
