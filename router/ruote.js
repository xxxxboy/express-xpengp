const methods = require('../libs/methods');
const slice = Array.prototype.slice;
const Layer = require('./layer');

class Route {
    constructor(path) {
        this.path = path;
        this.stack = [];
        this.methods = {};
        this.params = {};

        // 添加methods
        this.addMethods();
    }

    addMethods() {
        const self = this;
        methods.forEach(function (method) {
            self[method] = function () {
                const handles = slice.call(arguments);
                for (let i = 0; i < handles.length; i++) {
                    const handle = handles[i];
                    const layer = new Layer('/', {}, handle);
                    layer.method = method;
                    this.methods[method] = true;
                    this.stack.push(layer);
                }
            }
        });
    }
    // 匹配完路径后会调用这里 循环Layer内层路由
    dispath(req, res, done) {
        let idx = 0;
        const stack = this.stack;
        if (stack.length === 0) {
            return done();
        }

        const method = req.method.toLocaleLowerCase();

        req.route = this;

        next();

        function next(err) {
            if (err && err === 'route') {
                return done();
            }

            const layer = stack[idx++];

            if (!layer) {
                return done(err);
            }

            if (layer.method && layer.method !== method) {
                return next(err);
            }

            if (err) {
                layer.handle_error(err, req, res, next);
            } else {
                layer.handle_request(req, res, next);
            }

        }
    }
    // 判断是否存在对应的method
    _handles_method(method) {
        let name = method.toLowerCase();

        if (name === 'head' && !this.methods['head']) {
            name = 'get';
        }

        return Boolean(this.methods[name]);
    }
}


module.exports = Route;
