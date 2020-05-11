const multer = require('multer');


//解析form-data (上传文件类型格式) create multipart/form-data parser
module.exports = multer().any();
