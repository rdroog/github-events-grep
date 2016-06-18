# github-events-grep
A real-time regular expression matcher on the GitHub event stream, created for the Software Analysis course at the Radboud University Nijmegen in the year 2015/2016. It uses Node.JS and Rx.JS.

It is possible to search through the GitHub event stream with either an API-call or via the (very basic) UI. The API-calls are explained below, while the UI can be reached through /ui and is self-explanatory. The result is always valid JSON. If an error occurred, this is shown in JSON via '{error : [errorMessage]}'.

## API calls
An API-call is: /[part]/[id]/[call]/[regexp]

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