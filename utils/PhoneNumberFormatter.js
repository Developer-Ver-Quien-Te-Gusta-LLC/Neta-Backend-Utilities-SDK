function formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleanedNumber = phoneNumber.replace(/\D/g, '');

    /*// If cleanedNumber length is 12, remove the first two digits
    if (cleanedNumber.length === 12) {
        cleanedNumber = cleanedNumber.substring(2);
    }
    else if(cleanedNumber.length === 11){
        cleanedNumber = cleanedNumber.substring(1);
    }*/

    return cleanedNumber;
}

module.exports = { formatPhoneNumber };
