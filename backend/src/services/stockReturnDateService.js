function pakistanToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function validateReturnDate(value, arrivalDates, today = pakistanToday()) {
  const fail = message => { const error = new Error(message); error.status = 400; throw error; };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    fail('Enter a valid return date (YYYY-MM-DD).');
  }
  if (value > today) fail('Return date cannot be in the future.');
  if (!arrivalDates.length || arrivalDates.some(date => !date || value <= String(date).slice(0, 10))) {
    fail('Return date must be after the stock entry date for every selected batch.');
  }
  return value;
}
const returnTimestamp = date => new Date(`${date}T12:00:00+05:00`);
module.exports = { pakistanToday, validateReturnDate, returnTimestamp };
