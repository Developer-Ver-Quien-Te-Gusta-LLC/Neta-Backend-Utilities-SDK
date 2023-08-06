const AWS = require("aws-sdk");
const multer = require("multer"); // For file upload

if (!process.env.prod) {
  AWS.config.update({
    region: "us-east-1",
    accessKeyId: "AKIAUZGKQ2WWGMSRPFNJ",
    secretAccessKey: "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",
  });
}

// Configure multer to use memory storage (the file will be saved in a Buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // Keep images under 5MB
  },
});

// Initialize the Amazon S3 client
// use AWS KMS
const s3 = new AWS.S3({
  accessKeyId: "AKIAUZGKQ2WWGMSRPFNJ",
  secretAccessKey: "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",
  region: "us-east-1",
});

//#region Aws Cognito User Creation
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();

//function to create Cognito User with given attributes
async function CreateCognitoUser(
  username,
  firstName,
  lastName,
  phoneNumber,
  highschool,
  gender,
  age,
  prefs
) {
  const createUserParams = {
    UserPoolId: "us-east-1_VE718rqWX",
    Username: username,
    TemporaryPassword: "username123",
    MessageAction: "SUPPRESS",

    UserAttributes: [
      { Name: "custom:FirstName", Value: firstName },
      { Name: "custom:LastName", Value: lastName },
      { Name: "custom:highschool", Value: highschool },
      { Name: "custom:gender", Value: gender },
      { Name: "custom:age", Value: age },
      { Name: "custom:phone_number", Value: phoneNumber },
      { Name: "custom:userPrefs", Value: prefs },
      {Name:"custom:Subscription",Value:false},
    ],
  };

  return new Promise((resolve, reject) => {
    cognitoIdentityServiceProvider.adminCreateUser(
      createUserParams,
      (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      }
    );
  });
}

///
/// Replace bukket name with something determined from AWS KMS
///

//Upload pfp to s3 
async function UpdateCognitoUserPFP(username, pfp) {
  const params = {
    Bucket: "netapfps", // Replace with your S3 bucket name
    Key: pfp.originalname, // Use file original name as S3 key
    Body: pfp.buffer,
    ContentType: pfp.mimetype,
    ACL: "public-read", // This will make your uploaded files publicly readable
  };

  s3.upload(params, function (err, data) {
    if (err) {
      console.log(err);
    }
    UpdateCognitoUser(username, data.Location);
  });
}
 //Update user pfp link in cognito
async function UpdateCognitoUserPFP(name, link) {
  var params = {
    UserAttributes: [
      // array of attributes
      {
        Name: "custom:pfp",
        Value: link,
      },
    ],
    UserPoolId: "netausers",
    Username: name,
  };

  cognitoidentityserviceprovider.adminUpdateUserAttributes(
    params,
    function (err, data) {
      if (err) console.log(err, err.stack); // an error occurred
      else console.log(data); // successful response
    }
  );
}

//Delete cognito user
async function DeleteCognitoUser(username) {
  const deleteUserParams = {
    UserPoolId: "us-east-1_VE718rqWX",
    Username: username,
  };

  return new Promise((resolve, reject) => {
    cognitoIdentityServiceProvider.adminDeleteUser(
      deleteUserParams,
      function (err, data) {
        if (err) reject(err);
        else resolve(data);
      }
    );
  });
}

//update device id in cognito
async function UpdateDeviceID(username, id, OS) {
  var params = {
    UserAttributes: [
      // array of attributes
      {
        Name: "custom:deviceID",
        Value: link,
      },
      {
        Name: "custom:deviceType",
        Values: OS,
      },
    ],
    UserPoolId: "netausers",
    Username: username,
  };

  cognitoidentityserviceprovider.adminUpdateUserAttributes(
    params,
    function (err, data) {
      if (err) console.log(err, err.stack); // an error occurred
      else console.log(data); // successful response
    }
  );
}

//Fetch Device id by username
async function FetchDevice(username){
  try {

    const params = {
      UserPoolId: 'netausers', 
      Username: username, 
    };

    cognitoidentityserviceprovider.adminGetUser(params, function(err, data) {
      if (err) {
        return({ error:'Unable to fetch user attributes' });
      } else {
        const deviceType = data.UserAttributes.find(attr => attr.Name === 'custom:deviceType');
        const deviceID = data.UserAttributes.find(attr => attr.Name === 'custom:deviceID');


        return({ success: true, deviceType: deviceType.Value, deviceID: deviceID.Value });
      }
    });
  } catch (error) {
    console.error(error);
    return({ error:'Something went wrong' });
  }

}

//fetch all user prefs from cognito
async function FetchUserPrefs(username) {
  try {

    const params = {
      UserPoolId: 'netausers', 
      Username: username, 
    };

    cognitoidentityserviceprovider.adminGetUser(params, function(err, data) {
      if (err) {
        return({ error:'Unable to fetch user attributes' });
      } else {
        const prefs = data.UserAttributes.find(attr => attr.Name === 'custom:userPrefs');
        return({ success: true, prefs: prefs.Value });
      }
    });
  } catch (error) {
    console.error(error);
    return({ error:'Something went wrong' });
  }

}


// Set Subscription Status for the user in cognito
async function SetSubscription(username, subscription){
  var params = {
    UserAttributes: [
      // array of attributes
      {
        Name: "custom:subscription",
        Value: subscription,
      },
    ],
    UserPoolId: "netausers",
    Username: username,
  };

  cognitoidentityserviceprovider.adminUpdateUserAttributes(
    params,
    function (err, data) {
      if (err) console.log(err, err.stack); // an error occurred
      else console.log(data); // successful response
    }
  );
}

//#endregion

module.exports = {
  CreateCognitoUser,
  UpdateCognitoUserPFP,
  DeleteCognitoUser,
  UpdateDeviceID,
  FetchDevice,
  FetchUserPrefs,
  SetSubscription
};
