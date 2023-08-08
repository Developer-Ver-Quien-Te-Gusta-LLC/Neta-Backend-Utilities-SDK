const { ExecuteCustomScyllaQuery } = require("./DataBaseQueriesHandler.js").ExecuteCustomScyllaQuery;

async function IsUserInvited(confirmedInvitees) {
  if (!Array.isArray(confirmedInvitees) || confirmedInvitees.length === 0) {
    return false;
  }

  const query = `
    SELECT * FROM invites 
    WHERE invitee IN ? 
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  const invited = await ExecuteCustomScyllaQuery(query, [confirmedInvitees]);

  if (invited.length > 0) return invited[0]; // return the entire row if client has been invited
  else return false;
}

module.exports =  { IsUserInvited };