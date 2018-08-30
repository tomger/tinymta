
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
var cache = {};

csvParse(file, {
  columns: true,
  objname: 'stop_id'
}, function (err, data) {
  stops = data;
  // getTrainLines((rv)=>console.log(rv.join('\n')));
});

function distance(lat1, lon1, lat2, lon2) {
	var radlat1 = Math.PI * lat1/180
	var radlat2 = Math.PI * lat2/180
	var theta = lon1-lon2
	var radtheta = Math.PI * theta/180
	var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
	if (dist > 1) {
		dist = 1;
	}
	dist = Math.acos(dist)
	dist = dist * 180/Math.PI;
	dist = dist * 60 * 1.1515;
  dist = dist * 0.8684;
	// if (unit=="K") { dist = dist * 1.609344 }
	return dist
}

function getStopsByDistance(latitude, longitude) {
  let rv = [];
  for (let stop_id in stops) {
    let stop = stops[stop_id];
    stop.distance = distance(stop.stop_lat, stop.stop_lon, latitude, longitude);
    if (/*stop.location_type == 1 && */stop.distance < .6) {
      rv.push(stop);
    }
  }
  rv.sort((a, b) => {
    return a.distance - b.distance;
  });
  return rv;
}

function getGtfsFeed(id) {
  return new Promise(function(resolve, reject) {
    if (cache[id] && cache[id].header.timestamp.low * 1000 > (Date.now() - 30 * 1000)) {
      console.log('cache');
      resolve(cache[id]);
      return;
    }
    var requestSettings = {
      method: 'GET',
      url: `http://datamine.mta.info/mta_esi.php?key=${process.env.MTA_API_KEY}&feed_id=${id}`,
      encoding: null
    };
    request(requestSettings, function (error, response, body) {
      console.log('fresh data for', id);
      if (error || response.statusCode !== 200 || body.length < 30) {
        reject(error);
        return;
      }
      try {
        var feed = GtfsRealtimeBindings.FeedMessage.decode(body);
        // feed.header.gtfs_realtime_version
        cache[id] = feed;
        resolve(feed);
      } catch (e) {
        console.error('Decode error',e);
        // reject(e);
        resolve({})
        return
      }
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
  if (trains.length === 0) {
    return ""
  }
  trains.sort((a, b) => {
    return a.time - b.time;
  })
  return `<div class="train"><div class="train-station">${trains && trains[0].stop_name} (${trains[0].stop_id})</div>` + trains.splice(0, 3).map(train => {
    return `
      <div class="train-pill">
        <span class="train-route">${train.route}</span>
        <span class="train-time"><script>document.write((new Date(${train.time})).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}))</script></span>
      </div>
    `
  }).join('') + `</div>`
}


app.set('port', (process.env.PORT || 5000))
// app.use(express.static(__dirname + '/public'))

app.get('/', function(request, response) {
  let page = `
  <!DOCTYPE html>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
  body { margin: 0; padding: 0;background: #f7f7f7; font-family: -apple-system, BlinkMacSystemFont, sans-serif;}
  h1 {
    margin: 0 0 5px 0;
    text-align: center;
    border-bottom: 1px solid #ccc;
    background: #fff;
    font-size: 16px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
  }
  .train {
    padding: 16px 20px;
    border-bottom: 1px solid #ccc;
    background: #fff;
  }
  .train-station {
    font-size: 16px;
    font-weight: 400;
    margin-bottom: 4px;
  }
  .train-pill {
    font-size: 14px;
    display: inline-block;
    background: #fff;
    box-shadow: 0 1px 1px 0px #ddd;
    border-radius: 3px;
    overflow: hidden;
  }
  .train-time {
    padding: 3px;
  }
  .train-route {
    width: 20px;
    display: inline-block;
    text-align: center;
    background: #555;
    color: #fff;
  }
  </style>
  <h1>Realtime trains</h1>
  <div style="margin: 8px; border-radius: 3px; overflow: hidden; box-shadow: 0 0 1px #ddd;">
  `;
  response.write(page);

  let requestLocationHtml = `
  <script>
  var options = {
    enableHighAccuracy: true,
    timeout: 5000,
    maximumAge: 0
  };

  function success(pos) {
    var crd = pos.coords;
    console.log('Your current position is:', crd, pos);
    window.location = '?latitude=' + crd.latitude + '&longitude=' + crd.longitude;
  }

  function error(err) {
    console.warn(err);
  }
  function getLocation() {
    navigator.geolocation.getCurrentPosition(success, error, options);
  }
  </script>
  <a href="#" onclick="getLocation()">Get my location</a>
  `;

  let myStops = [];
  if (!request.query.latitude) {
    response.write(requestLocationHtml);
  } else {

    // let location = {
    //   latitude: 40.6746823,
    //   longitude: -73.9744451
    // };
    let location = request.query;
    myStops = getStopsByDistance(
      parseFloat(location.latitude),
      parseFloat(location.longitude)
    );
    console.log(myStops.splice(0, 4));
  }

  let feedMap = {
    '1' : ['1', '2', '3', '4', '5', '6'],
    '26': ['A', 'C', 'E', 'H'],
    '16': ['N', 'Q', 'R', 'W'],
    '21': ['B', 'D', 'F', 'M'],
    '2' : ['L'],
    '31': ['G'],
    '36': ['J', 'Z'],
    '51': ['7']
  };

  let feedIds = new Set();
  myStops.forEach(stop => {
    for (let feedId in feedMap) {
      if (feedMap[feedId].indexOf(stop.stop_id[0]) !== -1) {
        stop.feed_id = feedId;
        feedIds.add(feedId);
      }
    }

  })
  let promises = [];
  console.log(feedIds);
  for (let [feedId, _] of feedIds.entries()) {
    promises.push(getGtfsFeed(feedId).then(() => {
      console.log(feedId, 'done');
    }));
  }
  Promise.all(promises).then(() => {
    // console.log(cache);
    console.log('all done');
    Promise.all(myStops.map(stop => {
      let feed = cache[stop.feed_id]; /// EUEUHH
      // console.log(stop.feed_id, !!feed);
      if (!feed || !feed.entity) {
        return;
      }

      // console.log(feed, stop.stop_id);
      return getUpcomingTrainsFor(feed, stop.stop_id)
    })).then(rv => {

      let html = rv.map(stops => {
        // console.log(stops,  'x');
        return renderStops(stops)
      }).join('');
      // .then((rv) => renderStops(rv)))
      // console.log('what?', stops);
      response.end(html);
      console.log(html);
    });
  })
  .catch(err => {
    console.log(err);
  })
  // .finally(_ => {
  // });
})

app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'))
})
