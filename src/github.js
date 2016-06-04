const http = require('http');
const fs = require('fs');
const Rx = require('rx');
const DOM = require('rx-dom');
const RxNode = require('rx-node');
const request = require('request');

const hostname = '127.0.0.1';
const port = 1337;

const PUSHEVENT = 'PushEvent';

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    const events = makeGithubConnection();
    const filteredEvents = filterOnRegexp(events);
    console.log('In createserver:');
    console.log(events);
    res.end('Hello World\n');
}).listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});

function makeGithubConnection() {
    const options = {
        url: 'https://api.github.com/users/rdroog/events/public',
        timeout: 5000,
        headers: {
            'User-Agent': 'github-events-grep'
        }
    };
    
    request.
        get(options).
        on('error', function(err) {
            if(err.code === 'ETIMEDOUT') {
                console.log('timeout at server');
            } else {
                console.log('error occurred: ' + err);
            }
        }).
        on('response', function(response) {
            if(response.statusCode === 200) {
                console.log('status code correct');
            } else {
                console.log('incorrect status code: ' + response.statusCode);
            }
        }).
        on('data', function(events) {
            console.log('events received');
            filterOnRegexp(events);
        });
}

function filterOnRegexp(events) {
    const results = [];
    console.log('filteronregexp');
    console.log(events);
}
