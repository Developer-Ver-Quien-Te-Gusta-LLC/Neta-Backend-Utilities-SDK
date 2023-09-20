const axios = require('axios');
const MongoClient = require('mongodb').MongoClient;
const FetchFromSecrets = require('./AwsSecrets.js').FetchFromSecrets;
const ngeohash = require('ngeohash');
const crypto = require('crypto');
const fs = require('fs');
const request = require('request');

// Constants
const COLLECTION_NAME = 'schools';

async function SetupGeospatialDB() {
    const connectionString = await FetchFromSecrets("CosmosDBSpatialEndpoint");
    try {
        const client = await MongoClient.connect(connectionString, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            socketTimeoutMS: 60000 // 1 minute
        });
        console.log("Successfully connected to the database!");
        return client;
    } catch (error) {
        console.error("Error connecting to the database:", error);
        throw error; // Propagate the error so it can be handled
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

const CHUNK_SIZE = 20;
const CONCURRENT_PUSHES = 4;

const MAPBOX_API_KEY = "sk.eyJ1IjoianBnb3Jkb24wMCIsImEiOiJjbG1pYnJhMGgwdHhwM3NsbGRzOWR0dGZ1In0.rSKQFba9YPRQDDNwkFnokw"; // Replace with your Mapbox API key.

async function getLocationString(lon, lat) {
    try {
        const response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${MAPBOX_API_KEY}`);
        console.log(response.data);  // Print the whole response to see the structure

        if (response.status !== 200) {
            console.error("API returned non-200 status code");
            return null;
        }

        const locationData = response.data;
        if (locationData && locationData.features && locationData.features.length) {
            const place = locationData.features[0].place_name;
            return place;
        } else {
            console.error("Expected data structure not found in response");
            return null;
        }
    } catch (error) {
        console.error("Error in getLocationString:", error);
        return null;
    }
}
(async () => {
    //console.log(await getLocationString(-99.1332, 19.4326));  // Mexico City
})();
function chunkArray(array, size) {
    const chunked = [];
    let index = 0;
    
    while (index < array.length) {
        chunked.push(array.slice(index, size + index));
        index += size;
    }
    
    return chunked;
}
async function pushSchools(reqs, db) {
    const container = db.collection(COLLECTION_NAME);
    let itemBodies = [];

    for (let index = 0; index < reqs.length; index++) {
        let req = reqs[index];
        let uid = crypto.randomBytes(16).toString("hex");
        let location = ngeohash.decode(req.query.geohashValue);
        let name = req.query.name;
        name = name.replace(/^\d+\s/, '');
        let pfp = req.query.pfp;
        let pfpHash = !pfp ? undefined : await downloadAndHashImage(pfp);
        let numberOfStudents = 0

        let itemBody = {
            "uid": uid,
            "location": {
                "type": "Point",
                "coordinates": [location.longitude, location.latitude]
            },
            "name": name,
            "pfp": pfp,
            "pfpHash": pfpHash,
            "numberOfStudents": numberOfStudents,
            "locationStr": null,
        };

        itemBodies.push(itemBody);
    }

    // Chunk the items
    const chunks = chunkArray(itemBodies, CHUNK_SIZE);

    // Push chunks concurrently
    const pool = new PromisePool(async () => {
        if (chunks.length === 0) return null;
        const chunk = chunks.shift();
        return container.insertMany(chunk);
    }, CONCURRENT_PUSHES);

    try {
        await pool.start();
    } catch (error) {
        console.error('Error inserting data into the database:', error);
        throw error; // Propagate the error
    }
}

// Promise pool to handle concurrent pushes
class PromisePool {
    constructor(provider, concurrency) {
        this.provider = provider;
        this.concurrency = concurrency;
        this.active = [];
        this.doneWithCurrentBatch = false;
    }

    async start() {
        const promises = [];
        for (let i = 0; i < this.concurrency; i++) {
            promises.push(this.next());
        }
        await Promise.all(promises);
    }

    async next() {
        const promise = this.provider();
        if (!promise) {
            this.doneWithCurrentBatch = true;
            return;
        }

        // Log when a batch is dispatched
        console.log(`Dispatching batch at ${new Date().toISOString()}`);
        
        this.active.push(promise);

        const result = await promise;
        
        this.active.splice(this.active.indexOf(promise), 1);
        
        if (!this.doneWithCurrentBatch) {
            return this.next();
        }

        return result;
    }
}

function downloadAndHashImage(uri) {
    return new Promise((resolve, reject) => {
        request.head(uri, function (err, res, body) {
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

async function clearSchools(db) {
    const collection = db.collection(COLLECTION_NAME);
    const filter = {}; // Empty filter to match all documents
  
    try {
      const result = await collection.deleteMany(filter);
      console.log(`${result.deletedCount} documents deleted`);
    } catch (error) {
      console.error('Error deleting documents:', error);
      throw error;
    }
  }


async function fetchSchools(req, db) {
    const DEFAULT_UNIT = "km";
    let unit = req.query.unit || DEFAULT_UNIT;
    let queryname = req.query.queryname;
    let geohashValue = req.query.geohashValue;

    if (!geohashValue && (!req.query.longitude || !req.query.latitude)) {
        throw new Error('Either geohash or longitude and latitude must be provided');
    }
    if (req.query.longitude && isNaN(parseFloat(req.query.longitude))) {
        throw new Error('Longitude must be a decimal');
    }
    if (req.query.latitude && isNaN(parseFloat(req.query.latitude))) {
        throw new Error('Latitude must be a decimal');
    }
    const coordinates = !geohashValue ? { longitude: parseFloat(req.query.longitude), latitude: parseFloat(req.query.latitude) } : ngeohash.decode(geohashValue);
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
        filter["name"] = { $regex: `^${queryname}`, $options: 'i' };  // Prefix search
    }

    const results = await db.collection(COLLECTION_NAME).find(filter).skip(skipValue).limit(limitValue).toArray();

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
        nextPageToken: results.length === limitValue ? (skipValue + results.length).toString() : null
    };
}

module.exports = { SetupGeospatialDB, fetchSchools, pushSchools, clearSchools };
