
var path = require('path');
var fs = require('fs');

var express = require('express')
var app = express()
var GtfsRealtimeBindings = require('gtfs-realtime-bindings');
var Mta = require('mta-gtfs');
var request = require('request');
var csvParse = require('csv-parse');
var file = fs.readFileSync(path.join(__dirname, './node_modules/mta-gtfs/lib/data/gtfs/stops.txt'));
var stops = {};

csvParse(file, {
  columns: true,
  objname: 'stop_id'
}, function (err, data) {
  stops = data;
  // getTrainLines((rv)=>console.log(rv.join('\n')));
});

function getGtfsFeed(id) {
  return new Promise(function(resolve, reject) {
    var requestSettings = {
      method: 'GET',
      url: `http://datamine.mta.info/mta_esi.php?key=${process.env.MTA_API_KEY}&feed_id=${id}`,
      encoding: null
    };
    request(requestSettings, function (error, response, body) {
      if (error || response.statusCode !== 200 || body.length < 30) {
        return reject(rv);
      }
      var feed = GtfsRealtimeBindings.FeedMessage.decode(body);
      resolve(feed);
    });
  });
}

function getUpcomingTrainsFor(feed, station) {
  return new Promise(function(resolve, reject) {
    var rv = [];
    var trains = feed.entity
    .filter(function(entity) {
      if (!entity.trip_update) {
        return false;
      }
      return true;
    })
    trains.forEach(function(entity) {
      entity.trip_update.stop_time_update //.splice(0, 3)
      .filter(update => {
        return stops[update.stop_id] && update.arrival;
      })
      .filter(update => {
        return update.stop_id === station
      })
      .forEach(function(update) {
        // console.log(entity.trip_update.stop_time_update);
        rv.push({
          route: entity.trip_update.trip.route_id,
          stop_id: update.stop_id,
          stop_name: stops[update.stop_id].stop_name,
          time: update.arrival.time.low*1000
        });
      })
    });
    resolve(rv);
  });
}

function renderStops(trains) {
  trains.sort((a, b) => {
    return a.time - b.time;
  })
  return `<h3>${trains && trains[0].stop_name} (${trains[0].stop_id})</h3>` + trains.splice(0, 4).map(train => {
    return `
      <div class="train-pill">
        <span class="train-route">${train.route}</span>
        <span class="train-time"><script>document.write((new Date(${train.time})).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}))</script></span>
      </div>
    `
  }).join('')
}


app.set('port', (process.env.PORT || 5000))
// app.use(express.static(__dirname + '/public'))

app.get('/', function(request, response) {
  let page = `
  <!DOCTYPE html>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif;}
  .train-pill {
    display: inline-block;
    box-shadow: 0 1px 1px 0px #ddd;
    border-radius: 3px;
    overflow: hidden;
  }
  .train-route {
    width: 20px;
    display: inline-block;
    text-align: center;
    background: red;
    color: #fff;
  }
  </style>
  <h1>Realtime trains</h1>
  `;
  response.write(page);
  Promise.all([
    getGtfsFeed(1).then((feed) => {
      getUpcomingTrainsFor(feed, '130S').then((rv) => response.write(renderStops(rv)))
    }),
    getGtfsFeed(1).then((feed) => {
      getUpcomingTrainsFor(feed, '236N').then((rv) => response.write(renderStops(rv)))
    }),
    getGtfsFeed(16).then((feed) => {
      getUpcomingTrainsFor(feed, 'Q05S').then((rv) => response.write(renderStops(rv)))
    }),

  ]).then(() => {
    response.end();
  });
})

app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'))
})
