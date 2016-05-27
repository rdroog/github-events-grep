// from https://glebbahmutov.com/blog/node-server-with-rx-and-cycle/ (also on Github @ bahmutov/node-rx-cycle) under MIT License
const Rx = require('rx');
// pure
function main(sources) {
  return {
    HTTP: sources.HTTP.tap(e => console.log('request to', e.req.url))
  }
}
// pure
function makeHttpEffect() {
  const requests_ = new Rx.Subject();
  return {
    // effects
    writeEffect: function (model_) {
      model_.subscribe(e => {
        console.log('sending hello')
        e.res.writeHead(200, { 'Content-Type': 'text/plain' })
        e.res.end('Hello World\n')
      })
      return requests_
    },
    // effects
    serverCallback: (req, res) => {
      requests_.onNext({ req: req, res: res })
    },
    // effects
    readEffect: requests_
  }
}
// pure
const httpEffect = makeHttpEffect()
const drivers = {
  HTTP: httpEffect
}
// pure
function run(main, drivers) {
  const sources = {
    HTTP: drivers.HTTP.readEffect
  }
  const sinks = main(sources)
  Object.keys(drivers).forEach(key => {
    drivers[key].writeEffect(sinks[key])
  })
}
run(main, drivers)
// side effects
const http = require('http')
const hostname = '127.0.0.1'
const port = 8080
http.createServer(httpEffect.serverCallback)
  .listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`)
  });