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
    makeGithubConnection();
    //res.end('Hello World\n');
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
    
    var events;
    
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
        on('data', function(chunk) {
            console.log('events received');
            events += chunk;
        }).
        on('end', function() {
            filterOnRegexp(events);
        });
}

function filterOnRegexp(events) {
    const results = [];
    console.log('filteronregexp');
    console.log(events);
    //const x = '[{"id": "4070352487","type": "PushEvent","actor": {"id": 6671138},"repo": {"id": 59820930},"payload": {"push_id": 1131920416,"size": 1}}]';
    //console.log(typeof(events));
    //console.log(JSON.parse(events));
    //const data = JSON.parse(x);
    /*
        filter(function(event) {
            console.log('push');
            return event.type == PUSHEVENT;
        }).
        map(function(event) {
            results += event.payload;
            console.log('done');
        });
    console.log(results);*/
}
