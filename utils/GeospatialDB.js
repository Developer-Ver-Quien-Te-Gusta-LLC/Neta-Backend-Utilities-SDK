/// this class uses azure cosmosdb via the mongodb api in order to provide
/// geospatial searching for the 'schools' microservice

const axios = require('axios');

const MongoClient = require('mongodb').MongoClient;
const FetchFromSecrets = require('./AwsSecrets.js').FetchFromSecrets
const ngeohash = require('ngeohash');
const crypto = require('crypto');
const fs = require('fs');
const request = require('request');

async function SetupGeospatialDB() {
  const connectionString = await FetchFromSecrets("CosmosDBSpatialEndpoint")
    let client;
    try {
        client = await MongoClient.connect(connectionString, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log("Successfully connected to the database!");

        return client;
    } catch (error) {
        console.error("Error connecting to the database:", error);
    } finally {
        if (client) {
            //await client.close();
        }
    }
}

function haversineDistance(lon1, lat1, lon2, lat2, conversionFactor) {
    const toRad = (angle) => angle * (Math.PI / 180);
    
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return conversionFactor * c; // returns distance in km or mi
}

async function getLocationString(lon, lat) {
  try {
      const response = await axios.get(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
      const locationData = response.data;
      
      if (locationData && locationData.city && locationData.principalSubdivisionCode) {
          return `${locationData.city}, ${locationData.principalSubdivisionCode.split('-')[1]}`;
      } else {
          return null;
      }
  } catch (error) {
      console.error("Error in getLocationString:", error);
      return null;
  }
}

async function pushSchools(reqs, db) {
    const container = db.collection('schools'); // <-- Update with your collection's name
    
    let itemBodies = [];
    let locationPromises = [];
    
    for(let req of reqs) {
      let uid = crypto.randomBytes(16).toString("hex");
      let location = ngeohash.decode(req.query.geohashValue);
      let name = req.query.name;
      let pfp = req.query.pfp;
      let pfpHash = !pfp ? undefined : await downloadAndHashImage(pfp);
      let numberOfStudents = req.query.numberOfStudents;
  
      let itemBody = {
        "uid": uid,
        "location": {
          "type": "Point",
          "coordinates": [location.longitude, location.latitude] // backwords
        },
        "name": name,
        "pfp": pfp,
        "pfpHash": pfpHash,
        "numberOfStudents": numberOfStudents
      };
      
      itemBodies.push(itemBody);
      locationPromises.push(getLocationString(location.longitude, location.latitude));
    }
  
    const locationStrings = await Promise.allSettled(locationPromises);
    
    locationStrings.forEach((locationString, index) => {
        if (locationString.status === 'fulfilled' && locationString.value) {
            itemBodies[index].locationStr = locationString.value;
        }
    });
  
    await container.insertMany(itemBodies);
}
  
  function downloadAndHashImage(uri) {
    return new Promise((resolve, reject) => {
      request.head(uri, function(err, res, body){
        let imgPath = 'temp.jpg';
        request(uri).pipe(fs.createWriteStream(imgPath)).on('close', () => {
          let hash = crypto.createHash('sha256');
          let imgData = fs.readFileSync(imgPath);
          hash.update(imgData);
          let pfpHash = hash.digest('hex');
          fs.unlinkSync(imgPath); // delete the image
          resolve(pfpHash);
        });
      });
    });
  }

  async function fetchSchools(req, db) {
    const DEFAULT_UNIT = "km";
    let unit = req.query.unit || DEFAULT_UNIT;
    let queryname = req.query.queryname;
    let geohashValue = req.query.geohashValue;

    const coordinates = !geohashValue ? [req.latitude, req.longitude] : ngeohash.decode(geohashValue);
    const limitValue = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 10;
    const skipValue = req.query.nextPageToken ? parseInt(req.query.nextPageToken, 10) : 0;
    const conversionFactor = unit === 'mi' ? 6371 / 1.60934 : 6371;

    let filter = {
        "location": {
            $near: {
                $geometry: {
                    type: "Point",
                    coordinates: [coordinates.longitude, coordinates.latitude]
                }
            }
        }
    };

    if (queryname) {
        filter["details.name"] = new RegExp(`^${queryname}`, "i");  // Efficient prefix search
    }

    const results = await db.collection('schools').find(filter).skip(skipValue).limit(limitValue).toArray();

    return {
        rows: results.map(row => {
            const distance = haversineDistance(
                coordinates.longitude, coordinates.latitude,
                row.location.coordinates[0],
                row.location.coordinates[1],
                conversionFactor
            );
            return {
                ...row,
                distance
            };
        }),
        nextPageToken: (skipValue + results.length).toString()
    };
}



module.exports = { SetupGeospatialDB, fetchSchools, pushSchools }
