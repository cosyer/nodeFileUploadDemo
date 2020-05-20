let express = require("express");
let formidable = require("formidable");
let app = express();
let fs = require("fs-extra");
let path = require("path");
let concat = require("concat-files");
let opn = require("opn");
let multer = require("multer");

let uploadDir = "nodeServer/uploads";
let tmpDir = "nodeServer/tmp";

// let bodyParser=require('body-parser');
// app.use(bodyParser.urlencoded());

// 创建上传文件夹目录
folderIsExit(path.resolve(__dirname, uploadDir));
folderIsExit(path.resolve(__dirname, tmpDir));

//设置上传的的图片保存目录
// let objMulter = multer({ dest: uploadDir });

// 表示接收任何上传的数据 objMulter.single('user')(表示只接收name为user的上传数据).array('file', 10)10表示最大支持的文件上传数目
// app.use(objMulter.any());

// 处理静态资源
app.use(express.static(path.join(__dirname)));

// 处理跨域
app.all("*", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type,Content-Length, Authorization, Accept,X-Requested-With"
  );
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  res.header("X-Powered-By", " 3.2.1");
  if (req.method == "OPTIONS") res.send(200);
  /*让options请求快速返回*/ else next();
});

app.get("/success", function (req, resp) {
  let query = req.query;
  resp.send("success!!");
});

// multer上传
app.post("/multerUpload", multer({ dest: uploadDir }).any(), function (
  req,
  resp
) {
  let files = req.files;
  if (files.length === 0) {
    res.render("error", { message: "上传文件不能为空！" });
    return;
  } else {
    let fileInfos = [];
    for (var i in files) {
      let file = files[i];
      let fileInfo = {};
      //这里修改文件名
      fs.renameSync(
        path.resolve(__dirname, uploadDir, file.filename),
        path.resolve(__dirname, uploadDir, file.originalname)
      );
      // 获取文件基本信息
      fileInfo.mimetype = file.mimetype;
      fileInfo.originalname = file.originalname;
      fileInfo.size = file.size;
      fileInfo.path = file.path;

      fileInfos.push(fileInfo);
    }
    // 设置响应类型及编码
    resp.set({
      "content-type": "application/json; charset=utf-8",
    });
    resp.end("success!");
  }
});

// 检查文件的MD5
app.get("/check/file", (req, resp) => {
  let query = req.query;
  let fileName = query.fileName;
  let fileMd5Value = query.fileMd5Value;
  // 获取文件Chunk列表
  getChunkList(
    path.join(uploadDir, fileName),
    path.join(uploadDir, fileMd5Value),
    (data) => {
      resp.send(data);
    }
  );
});

// 检查chunk的MD5
app.get("/check/chunk", (req, resp) => {
  let query = req.query;
  let chunkIndex = query.index;
  let md5 = query.md5;

  fs.stat(path.join(uploadDir, md5, chunkIndex), (err, stats) => {
    if (stats) {
      resp.send({
        stat: 1,
        exit: true,
        desc: "Exit 1",
      });
    } else {
      resp.send({
        stat: 1,
        exit: false,
        desc: "Exit 0",
      });
    }
  });
});

// 上传chunk
app.all("/upload", (req, resp) => {
  // 解析表单数据
  var form = new formidable.IncomingForm({
    uploadDir: tmpDir,
  });
  form.parse(req, function (err, fields, file) {
    // 其中的参数
    let index = fields.index;
    let total = fields.total;
    let fileMd5Value = fields.fileMd5Value;
    let folder = path.resolve(__dirname, uploadDir, fileMd5Value);
    // path.join path.resovle ??
    folderIsExit(folder).then((val) => {
      let destFile = path.resolve(folder, fields.index);
      console.log("----------->", file.data.path, destFile);
      // tmp目录cp到目标目录
      copyFile(file.data.path, destFile).then(
        (successLog) => {
          resp.send({
            stat: 1,
            desc: index,
          });
        },
        (errorLog) => {
          resp.send({
            stat: 0,
            desc: "Error",
          });
        }
      );
    });
  });
});

// 合并文件
app.all("/merge", (req, resp) => {
  let query = req.query;
  let md5 = query.md5;
  let size = query.size;
  let fileName = query.fileName;
  console.log(md5, fileName);
  mergeFiles(path.join(uploadDir, md5), uploadDir, fileName, size);
  resp.send({
    stat: 1,
  });
});

// 获取文件Chunk列表
async function getChunkList(filePath, folderPath, callback) {
  let isFileExit = await isExist(filePath);
  let result = {};
  // 如果文件(文件名, 如:node-v7.7.4.pkg)已经存在, 不用再继续上传, 直接秒传
  if (isFileExit) {
    result = {
      stat: 1,
      file: {
        isExist: true,
        name: filePath,
      },
      desc: "file is exist",
    };
  } else {
    let isFolderExist = await isExist(folderPath);
    console.log(folderPath);
    // 如果文件夹(md5值后的文件)存在, 就获取已经上传的块
    let fileList = [];
    if (isFolderExist) {
      fileList = await listDir(folderPath);
    }
    result = {
      stat: 1,
      chunkList: fileList,
      desc: "folder list",
    };
  }
  callback(result);
}

// 合并文件
async function mergeFiles(srcDir, targetDir, newFileName, size) {
  console.log(...arguments);
  let targetStream = fs.createWriteStream(path.join(targetDir, newFileName));
  let fileArr = await listDir(srcDir);
  fileArr.sort((x, y) => {
    return x - y;
  });
  // 列出所有chunk文件 把文件名加上文件夹的前缀
  for (let i = 0; i < fileArr.length; i++) {
    fileArr[i] = srcDir + "/" + fileArr[i];
  }
  console.log(fileArr);
  concat(fileArr, path.join(targetDir, newFileName), () => {
    console.log("Merge Success!");
  });
}

// 文件夹是否存在, 不存在则创建文件
function folderIsExit(folder) {
  console.log("folderIsExit", folder);
  return new Promise(async (resolve, reject) => {
    let result = await fs.ensureDirSync(path.join(folder));
    console.log("result----", result);
    resolve(true);
  });
}

// 把文件从一个目录拷贝到别一个目录
function copyFile(src, dest) {
  let promise = new Promise((resolve, reject) => {
    fs.rename(src, dest, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve("copy file:" + dest + " success!");
      }
    });
  });
  return promise;
}

// 文件或文件夹是否存在
function isExist(filePath) {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      // 文件不存在
      if (err && err.code === "ENOENT") {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// 列出文件夹下所有文件
function listDir(path) {
  return new Promise((resolve, reject) => {
    fs.readdir(path, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      // 把mac系统下的临时文件去掉
      if (data && data.length > 0 && data[0] === ".DS_Store") {
        data.splice(0, 1);
      }
      resolve(data);
    });
  });
}

app.listen(5000, () => {
  console.log("服务启动完成，端口监听5000！");
  opn("http://localhost:5000");
});
