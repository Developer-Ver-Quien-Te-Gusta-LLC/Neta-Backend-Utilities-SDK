const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();


async function fetchSchools(latitude, longitude, pageKey, query) {
  const startFrom = pageKey || 0;
  let sqlQuery = `
  SELECT num_students AS numberOfStudents, school_name AS name, ST_DISTANCE(ST_GEOGPOINT(longitude, latitude), ST_GEOGPOINT(${longitude}, ${latitude})) as distance
  FROM \`highschools.SchoolsData\`
  ORDER BY distance ASC
  LIMIT 10 OFFSET ${startFrom}
  `;
  if (query) {
    query = query.replace(/n/gi, '[ñn]')
    
    sqlQuery = `
    SELECT num_students AS numberOfStudents, 
       school_name AS name, 
       ST_DISTANCE(ST_GEOGPOINT(longitude, latitude), ST_GEOGPOINT(${longitude}, ${latitude})) as distance
FROM \`highschools.SchoolsData\`
WHERE REGEXP_CONTAINS(UPPER(school_name), '${query}')
ORDER BY distance ASC
LIMIT 10 OFFSET ${startFrom}
    `;
  }

  const options = {
    query: sqlQuery,
    location: 'US',
  };

  // Run the query as a job
  const [job] = await bigquery.createQueryJob(options);
  //console.log(`Job ${job.id} started.`);

  // Wait for the query to finish
  const [rows] = await job.getQueryResults();

  // Return the next page key
  return {rows, nextPageToken: parseInt(startFrom) + 10};
}


async function incrementNumberOfStudents(schoolName, db) {
    const query = `
    UPDATE \`highschools.SchoolsData\`
    SET num_students = num_students + 1
    WHERE school_name = "${schoolName}"
  `;
  const options = {
    query: query,
    location: 'US',
  };

  // Run the query as a job
  const [job] = await bigquery.createQueryJob(options);
  //console.log(`Job ${job.id} started.`);

  // Wait for the query to finish
  const [rows] = await job.getQueryResults();

  console.log(`Number of students incremented for ${schoolName}`);
  }

async function getNumberOfStudents(schoolName) {
    try {
        const query = `
        SELECT num_students AS numberOfStudents
        FROM \`highschools.SchoolsData\`
        WHERE school_name = "${schoolName}"
      `;
      const options = {
        query: query,
        location: 'US',
      };

      // Run the query as a job
      const [job] = await bigquery.createQueryJob(options);
      console.log(`Job ${job.id} started.`);

      // Wait for the query to finish
      const [rows] = await job.getQueryResults();

      // Return the number of students
      return rows[0].numberOfStudents;
    } catch (error) {
        console.error(`Failed to get number of students for ${schoolName}: ${JSON.stringify(error)}`);
        return 0;
    }
}

  

module.exports = {incrementNumberOfStudents, fetchSchools,getNumberOfStudents };
