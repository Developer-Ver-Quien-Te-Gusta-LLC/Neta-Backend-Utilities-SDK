function formatPhoneNumber(phoneNumber) {
    // Check if phone number contains any non-digit characters (excluding + and spaces)
    if (/[^0-9+\s]/.test(phoneNumber)) {
        throw new Error("Invalid characters in phone number. Only digits, '+' and spaces are allowed.");
    }

    // Remove + and spaces
    let formattedNumber = phoneNumber.replace(/[+\s]/g, '');

    return formattedNumber;
}

module.exports = formatPhoneNumber;
