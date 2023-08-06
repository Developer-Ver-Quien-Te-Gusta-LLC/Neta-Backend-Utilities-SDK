import{IsUserInvited} from "../index.js";
//Client facing function to check if a user is invited , done while onboarding
 async function CheckForInvite (phone_number)  {
    var inviteStatus = IsUserInvited(phone_number);
    res.status(200).json({ success: true, data: inviteStatus });
}


module.exports = {CheckForInvite};
