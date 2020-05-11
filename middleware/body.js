const bodyParser = require('body-parser');


exports = module.exports;

//解析raw/json create application/json parser
exports.json = bodyParser.json({ limit: '100mb' });

//解析form表单 create application/x-www-form-urlencoded parser
exports.urlencoded = bodyParser.urlencoded({ limit: '100mb', extended: false });
