const RELATIONSHIP_STATUSES = Object.freeze([
  "Prefer not to say",
  "Single",
  "In a relationship",
  "Engaged",
  "Married",
]);

const MAX_NAME_LENGTH = 100;
const MAX_PHONE_LENGTH = 30;
const MAX_ABOUT_LENGTH = 500;

function optionalString(value, field, errors) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    errors[field] = "Enter text for this field.";
    return "";
  }
  return value.trim();
}

function isValidCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function validateProfileInput(body) {
  const errors = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { profile: null, errors: { fullName: "Profile information is required." } };
  }

  const fullName = optionalString(body.fullName, "fullName", errors).replace(/\s+/gu, " ");
  if (!errors.fullName) {
    if (fullName.length < 2 || fullName.length > MAX_NAME_LENGTH) {
      errors.fullName = `Name must be between 2 and ${MAX_NAME_LENGTH} characters.`;
    } else if (!/^[\p{L}\p{M}][\p{L}\p{M} .’'\-]*$/u.test(fullName) || !/\p{L}/u.test(fullName)) {
      errors.fullName = "Enter a valid name using letters, spaces, apostrophes, periods, or hyphens.";
    }
  }

  const phone = optionalString(body.phone, "phone", errors);
  if (!errors.phone && phone) {
    const digits = phone.replace(/\D/gu, "");
    if (phone.length > MAX_PHONE_LENGTH || !/^\+?[0-9][0-9\s().-]*$/u.test(phone) || digits.length < 7 || digits.length > 15) {
      errors.phone = "Enter a valid phone number with 7 to 15 digits, or leave it blank.";
    }
  }

  const dateOfBirth = optionalString(body.dateOfBirth, "dateOfBirth", errors);
  if (!errors.dateOfBirth && dateOfBirth) {
    const today = new Date().toISOString().slice(0, 10);
    if (!isValidCalendarDate(dateOfBirth) || dateOfBirth > today) {
      errors.dateOfBirth = "Enter a valid date of birth that is not in the future.";
    }
  }

  const relationshipStatus = optionalString(body.relationshipStatus, "relationshipStatus", errors);
  if (!errors.relationshipStatus && relationshipStatus && !RELATIONSHIP_STATUSES.includes(relationshipStatus)) {
    errors.relationshipStatus = "Choose a relationship status from the available options.";
  }

  const aboutMe = optionalString(body.aboutMe, "aboutMe", errors);
  if (!errors.aboutMe && aboutMe.length > MAX_ABOUT_LENGTH) {
    errors.aboutMe = `About Me must be ${MAX_ABOUT_LENGTH} characters or fewer.`;
  }

  if (Object.keys(errors).length) return { profile: null, errors };

  return {
    errors: null,
    profile: {
      fullName,
      phone: phone || null,
      dateOfBirth: dateOfBirth || null,
      relationshipStatus: relationshipStatus || null,
      aboutMe: aboutMe || null,
    },
  };
}

module.exports = { RELATIONSHIP_STATUSES, validateProfileInput };
