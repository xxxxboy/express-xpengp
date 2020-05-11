const http = require('http');
const url = require('url');
const Router = require('./router');
const slice = Array.prototype.slice;
const methods = require('./libs/methods');
const flatten = require('./libs/array-flatten');
const setPrototypeOf = require('setprototypeof');
const EventEmitter = require('events').EventEmitter;
const middleware = require('./middleware/init');
const query = require('./middleware/query');
const body = require('./middleware/body');


class app extends EventEmitter{
    // 构建方法
    constructor() {
        super();
        this.cache = {};
        this.engines = {};
        this.settings = {};

        this.on('mount', function onmount (parent) {
            // 继承中间件的代理函数
            if (this.settings[trustProxyDefaultSymbol] === true
                && typeof parent.settings['trust proxy fn'] === 'function') {
                delete this.settings['trust proxy'];
                delete this.settings['trust proxy fn'];
            }

            // 继承中间件的属性
            setPrototypeOf(this.request, parent.request);
            setPrototypeOf(this.response, parent.response);
            setPrototypeOf(this.engines, parent.engines);
            setPrototypeOf(this.settings, parent.settings);
        });

        this.mountpath = '/';

        // default locals 本地变量 不会被中间件的变量覆盖
        this.locals = Object.create(null);
        this.locals.settings = this.settings;

        // 添加methods
        this.addMethods();
    }
    // 创建Router实例 添加中间件时才会调用
    lazyrouter () {
        if(!this._router) {
            this._router = new Router({
                // caseSensitive: this.enabled('case sensitive routing'),
                caseSensitive: true,
                // strict: this.enabled('strict routing')
            });

            // 安装默认中间件
            this._router.use(query());
            this._router.use(middleware.init(this));
            this._router.use(body.json);
            this._router.use(body.urlencoded);
        }
    }
    // 监听函数的回调方法
    handle(req, res, callback) {
        const router = this._router;

        const done = callback || function () {
            console.log('结束路由了');
            res.end('路由不存在');
        };

        if (!router) {
            console.warn('no routes defined on app');
            done();
            return;
        }

        router.handle(req, res, done);
    }
    // 开始监听函数
    listen() {
        const server = http.createServer(this.handle.bind(this));
        return server.listen.apply(server, arguments);
    }
    // 使用use添加中间件
    use(fn) {
        let offset = 0; // 去除参数格式
        let path = '/'; // default

        if (typeof fn !== 'function') {
            let arg = fn;

            // 第一个参数为数组时，取第一个
            while (Array.isArray(arg) && arg.length !== 0) {
                arg = arg[0];
            }

            // 第一个参数为路径
            if (typeof arg !== 'function') {
                offset = 1;
                path = fn;
            }
        }

        const fns = flatten(slice.call(arguments, offset));

        if (fns.length === 0) {
            throw new TypeError('app.use() requires a middleware function');
        }

        // create Router instance
        this.lazyrouter();
        const router = this._router;

        fns.forEach(function (fn) {
            // 普通路由 非安装中间件
            if (!fn || !fn.handle || !fn.set) {
                return router.use(path, fn);
            }

            // 挂载中间件
            fn.mountpath = path;
            fn.parent = this;

            // restore .app property on req and res
            router.use(path, function mounted_app (req, res, next) {
                const orig = req.app;
                fn.handle(req, res, function (err) {
                    setPrototypeOf(req, orig.request);
                    setPrototypeOf(res, orig.response);
                    next(err);
                })
            });
            // mounted on app
            fn.emit('mount', this);
        }, this); // 将this绑定到第一个函数上

    }
    // 添加其它的添加中间件的方法 eg. get、post
    addMethods() {
        const self = this;
        methods.forEach((method) => {
            self[method] = function (path) {
                self.lazyrouter();
                const route = self._router.route(path);
                route[method].apply(route, slice.call(arguments, 1));
                return this;
            }
        });
    }
}

module.exports = app;
