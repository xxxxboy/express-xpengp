const { pathToRegexp } = require('path-to-regexp');

class Layer {
    // 构建函数
    constructor(path, options = {}, fn) {
        this.handle = fn;
        this.name = fn.name || '<anonymous>';
        this.path = undefined;
        this.method = '';
        this.regexp = path;
        this.params = undefined;
        this.keys = [];

        // set fast path flags
        this.regexp = pathToRegexp(path, this.keys = [], options); // 执行后就就会在keys中自动填充路径中的param key值
        this.regexp.fast_star = path === '*'; // 路径 * 直接跳过匹配（匹配成功）
        this.regexp.fast_slash = path === '/' && options.end === false; // 路径为 / 且不匹配结尾的 直接跳过匹配 例如 .use
    }
    // 匹配路劲
    match(path) {
        let match;
        if (path != null) {
            // fast path non-ending match for / (any path matches) eg. use
            if (this.regexp.fast_slash) {
                this.params = {};
                this.path = '';
                return true
            }

            // fast path for * (everything matched in a param)
            if (this.regexp.fast_star) {
                this.params = {};
                this.path = path;
                return true
            }

            // match the path
            match = this.regexp.exec(path);
        }

        if (!match) {
            this.params = undefined;
            this.path = undefined;
            return false;
        }

        // 解析param参数
        this.params = {};
        this.path = match[0]; // match 第一个为元素为匹配到的路径

        let keys = this.keys;
        let params = this.params;

        // match 第一个为元素为匹配到的路径 所以需要从第二个开始循环
        // keys 在方法pathToRegexp执行后就已经填充了路径中的param key值
        for (let i = 1; i < match.length; i++) {
            let key = keys[i - 1];
            let prop = key.name;
            let val = Layer.decode_param(match[i]);

            if (val !== undefined || !(prop in params)) {
                params[prop] = val;
            }
        }

        return true;
    }
    // 处理错误路由
    handle_error(error, req, res, next) {
        const fn = this.handle;

        if (fn.length !== 4) { // fn函数参数个数
            return next(error);
        }

        try {
            fn(error, req, res, next);
        } catch (err) {
            next();
        }
    }
    // 处理路由 执行中间件的回调方法
    handle_request(req, res, next, Router) {
        const fn = this.handle;

        try {
            if (Router && typeof Router == 'function' && Router.toString().startsWith('class') && fn instanceof Router) {
                fn.handle(req, res, next);
            } else {
                fn(req, res, next);
            }

        } catch (err) {
            next(err);
        }
    }

    static decode_param(val) {
        if (typeof val !== 'string' || val.length === 0) {
            return val;
        }
        // 若为字符串可能会需要进行 url解码
        try {
            return decodeURIComponent(val);
        } catch (err) {
            if (err instanceof URIError) {
                err.message = 'Failed to decode param \'' + val + '\'';
                err.status = err.statusCode = 400;
            }

            throw err;
        }
    }
}

module.exports = Layer;
