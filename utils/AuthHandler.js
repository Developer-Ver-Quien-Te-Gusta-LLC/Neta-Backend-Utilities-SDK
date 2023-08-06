const jwt = require("jsonwebtoken");

//#region JWT Authentication
async function GetUserDataFromJWT(req) {
  //const token = req.headers.authorization;
  const token = req.headers.authorization;

  if (!token) {
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