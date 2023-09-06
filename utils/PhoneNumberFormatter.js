function formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleanedNumber = phoneNumber.replace(/\D/g, '');

    // Insert a space between every digit
    let formattedNumber = cleanedNumber.split('').join(' ');

    return formattedNumber;
}

module.exports = { formatPhoneNumber };
