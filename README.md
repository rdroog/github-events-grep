# github-events-grep
A real-time regular expression matcher on the GitHub event stream, created for the Software Analysis course at the Radboud University Nijmegen in the year 2015/2016. It uses Node.JS and Rx.JS.

It is possible to search through the GitHub event stream with either an API-call or via the (very basic) UI. The API-calls are explained below, while the UI can be reached through /ui and is self-explanatory. The UI is never real-time (someone could add this, though). The result is always valid JSON. If an error occurred, this is shown in JSON via '{error : [errorMessage]}'.

Change the IP and port according to own preferences, and the same holds for the logginglevel.

## API calls
An API-call is: /[realtime]/[part]/[id]/[call]/[regexp]

#### [realtime]
The realtime is either empty or realtime/[length], where the length is in ms with a minimum of 1 second and a maximum of 1 year.

#### [part]
The part is one of the following:
* payload: will only search on the payload-part of events.
* custom: same as payload.
* standard: will only search on the standard-part of events.
* both: will search through both the payload-part and standard-part of events.

#### [id]
The id is one of the following:
* id: will only return the id's of events matched.
* complete: will return the complete events of matches.

#### [call]
The call is one of the following:
* all: will search through every event.
* one/[eventType]: will search through one event with the type [eventType].

###### [eventType]
The eventType should be a type of an GitGub event, like 'PushEvent'.

#### [regexp]
Regexp denotes the regular expression. It is always case insensitive.

## Few example API calls:
* /realtime/10000/both/complete/all/test : search through all events on 'test', both parts (standard + payload), in all found events and for another 10 seconds. Return complete events.
* /payload/id/one/PushEvent/test : search on 'test', only in payload, only in PushEvent's. Not real-time. Return only ids.
* /custom/id/one/PushEvent/test : same one as above.
* /realtime/600000/payload/id/one/PushEvent/test : search through all found events and for another 10 minutes (real-time) on 'test' in payload and only in PushEvent.


# Installation and running
This package can currently be run if Node is installed with the following packages:
* rxjs
* rx-dom
* rx-node
* request
* gen-run

Starting is done via node with: 'node src/github.js', which runs the server. One can then open a browser and perform the requests as stated above.