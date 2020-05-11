const Layer = require('./layer');
const Route = require('./ruote');
const methods = require('../libs/methods');
const parseUrl = require('parseurl');
const slice = Array.prototype.slice;
const flatten = require('../libs/array-flatten');

class Router {
    // 构建方法
    constructor(options = {}) {
        this.stack = [];
        this.mergeParams = options.mergeParams;
        this.params = {};
        this.caseSensitive = options.caseSensitive;

        // 填加methods
        this.addMethods();
    }
    // 创建Route类
    route(path) {
        const route = new Route(path);
        const layer = new Layer(
            path,
            {
                caseSensitive: this.caseSensitive,
                end: true
            },
            route.dispath.bind(route) // 刚创建时没用 绑定route对象 调用到此路由时会执行
        );

        layer.route = route;

        this.stack.push(layer);
        return route;
    }
    // app.use调用的方法
    use(fn) {
        let offset = 0;
        let path = '/';

        if (typeof fn !== 'function') {
            let arg = fn;

            while (Array.isArray(arg) && arg.length !== 0) {
                arg = arg[0];
            }

            if (typeof arg !== 'function') {
                offset = 1;
                path = fn;
            }
        }

        const callbacks = flatten(slice.call(arguments, offset));

        if (callbacks.length === 0) {
            throw new TypeError('Router.use() requires a middleware function');
        }

        for (let i = 0; i < callbacks.length; i++) {
            let fn = callbacks[i];

            // if (typeof fn !== 'function') {
            //     throw new TypeError('Router.use() requires a middleware function')
            // }

            const layer = new Layer(path, {
                sensitive: this.caseSensitive,
                end: false
            }, fn);

            layer.route = undefined;

            this.stack.push(layer);
        }

        return this;
    }
    // app.handle调用的方法  路由被调用时用于处理的方法
    handle(req, res, out) { // 这里
        const self = this;

        let idx = 0;

        const protohost = Router.getProtohost(req.url) || ''; // 获取协议和host字符串  eg. 'http://192.168.0.1'
        const paramcalled = {}; // 保存req.param添加的中间件函数
        const parentParams = req.params;
        const parentUrl = req.baseUrl || '';
        let removed = ''; // 保存已经匹配过得路径  用于删除
        let slashAdded = false; // 获取req.url时 是否需要去除第一个字符 "/"

        // 将req属性保存  调用done时，重新赋值给req 并执行out
        const done = Router.restore(out, req, 'baseUrl', 'next', 'params');

        const stack = self.stack;

        req.next = next;

        req.baseUrl = parentUrl;
        req.originalUrl = req.originalUrl || req.url;

        next();

        function next(err) {
            let layerError = err === 'route'
                ? null
                : err;
            if (layerError) {
                console.error(err);
            }

            if (idx >= stack.length) {
                console.warn('没有可以匹配的路由了');
                setImmediate(done, layerError);
                return;
            }

            const path = Router.getPathname(req);

            if (path == null) {
                return done(layerError);
            }

            let layer;
            let match;
            let route;

            while (match !== true && idx < stack.length) {
                layer = self.stack[idx++];
                match = layer.match(path);
                route = layer.route;

                if (typeof match !== 'boolean') {
                    // 解析param参数 进行url转码时抛出的错误
                    layerError = layerError || match;
                }

                if (match !== true) {
                    layerError = layerError || match;
                    continue;
                }

                if (!route) {
                    // process non-route handlers normally
                    // use 添加的layer
                    continue;
                }

                const method = req.method;
                const has_method = route._handles_method(method);

                if (!has_method && method !== 'HEAD') {
                    match = false;
                }
            }

            if (match !== true) {
                console.error('未匹配');
                return done(layerError);
            }

            if (route) {
                req.route = route;
            }

            req.params = self.mergeParams // 合并match匹配时layer添加的params参数
                ? Object.assign(layer.params, parentParams)
                : layer.params;

            const layerPath = layer.path;
            // process_params 用于处理app.param添加的中间件
            self.process_params(layer, paramcalled, req, res, function (err) {
                if (err) {
                    return next(layerError || err);
                }

                if (route) {
                    // 如果有route(非use),则直接执行
                    return layer.handle_request(req, res, next);
                }
                // 删除req.url中已经匹配过的路径
                trim_prefix(layer, layerError, layerPath, path);
            });

            function trim_prefix(layer, layerError, layerPath, path) {
                if (layerPath.length !== 0) {
                    // Validate path breaks on a path separator
                    const c = path[layerPath.length];
                    if (c && c !== '/' && c !== '.') return next(layerError);

                    // Trim off the part of the url that matches the route
                    // middleware (.use stuff) needs to have the path stripped
                    removed = layerPath;
                    req.url = protohost + req.url.substr(protohost.length + removed.length);

                    // Ensure leading slash
                    if (!protohost && req.url[0] !== '/') {
                        req.url = '/' + req.url;
                        slashAdded = true;
                    }

                    // Setup base URL (no trailing slash)
                    req.baseUrl = parentUrl + (removed[removed.length - 1] === '/'
                        ? removed.substring(0, removed.length - 1)
                        : removed);
                }


                if (layerError) {
                    layer.handle_error(layerError, req, res, next);
                } else {
                    layer.handle_request(req, res, next, Router);
                }
            }
        }
    }
    // 添加其它的添加中间件的方法 对应于app.get
    addMethods() {
        const self = this;
        methods.concat('all').forEach(function (method) {
            self[method] = function (path) {
                const route = self.route(path);
                route[method].apply(route, slice.call(arguments, 1));
                return this;
            }
        });
    }
    // 用于处理app.param添加的对应参数的处理函数 这里先忽略不处理
    process_params(layer, called, req, res, done) {
        const parmas = this.params;

        const keys = layer.keys;

        // 没有param参数 直接执行回调 跳过下边的处理
        if (!keys || keys.length === 0) {
            return done();
        }

        // 省略app.param回调处理
        return done();

    }

    static getProtohost(url) {
        if (typeof url !== 'string' || url.length === 0 || url[0] === '/') {
            return undefined
        }

        const searchIndex = url.indexOf('?')
        const pathLength = searchIndex !== -1
            ? searchIndex
            : url.length
        const fqdnIndex = url.substr(0, pathLength).indexOf('://')

        return fqdnIndex !== -1
            ? url.substr(0, url.indexOf('/', 3 + fqdnIndex))
            : undefined
    }

    static restore(fn, obj) {
        let props = new Array(arguments.length - 2);
        let vals = new Array(arguments.length - 2);

        for (let i = 0; i < props.length; i++) {
            props[i] = arguments[i + 2];
            vals[i] = obj[props[i]];
        }

        return function () {
            // restore vals
            for (let i = 0; i < props.length; i++) {
                obj[props[i]] = vals[i];
            }

            return fn.apply(this, arguments);
        };
    }

    static getPathname(req) {
        try {
            return parseUrl(req).pathname;
        } catch (err) {
            return undefined;
        }
    }
}


module.exports = Router;
