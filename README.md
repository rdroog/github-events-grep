# github-events-grep
A real-time regular expression matcher on the GitHub event stream, created for the Software Analysis course at the Radboud University Nijmegen in the year 2015/2016.

## API calls
An API-call is: /[part]/[id]/[call]/[regexp]

### part
The part is one of the following:
* custom
* payload
* standard
* both

### id
The id is one of the following:
* id
* complete

### call
The call is one of the following:
* all
* one/[eventType]

#### eventType
The eventType should be a type of an Github event, like `PushEvent'.

### regexp
Regexp denotes the regular expression. It is always case insensitive.