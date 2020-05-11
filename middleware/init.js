'use strict';

exports.init = function(app){
    return function expressInit(req, res, next){

        res.setHeader('X-Powered-By', 'xpengp');

        next();
    };
};

