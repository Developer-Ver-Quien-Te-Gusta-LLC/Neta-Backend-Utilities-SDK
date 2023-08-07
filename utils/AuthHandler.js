const jwt = require("jsonwebtoken");
const {SendEvent} = require('./Analytics.js')

//#region JWT Authentication
async function GetUserDataFromJWT(req) {
  //const token = req.headers.authorization;
  const token = req.headers.authorization;

  if (!token) {
    await SendEvent('authorization_failed', null, {headers:req.headers, body:req.body,qstring:req.query})
    return { success: false, err: "A token is required for authentication" };
  }

  try {
    const decoded = jwt.decode(token);
    return decoded;
  } catch (error) {
    return { success: false, err: error };
  }
}
//#endregion

module.exports = { GetUserDataFromJWT };