const ethers = require("ethers");

//custom provider
// polling is only true when I set it to, not auto set by calling addlistener do(this default behavior).
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();

var MyJsonRpcProvider = (function (_super) {
    __extends(MyJsonRpcProvider, _super);
    function MyJsonRpcProvider(url, network) {
        var _this = this;
        _this = _super.call(this, url, network);
        return _this;
    }

    MyJsonRpcProvider.prototype.on = function (eventName, listener) {
        var _this = this;
        let polling = this.polling;
        this._addEventListener(eventName, listener, false);
        this.polling = polling;
        //console.log("call my on fun", eventName);
        return _this;
    }

    MyJsonRpcProvider.prototype.once = function(eventName, listener) {
        var _this = this;
        let polling = this.polling;
        this._addEventListener(eventName, listener, true);
        this.polling = polling;
        //console.log("call my on fun", eventName);
        return _this;
    }
    return MyJsonRpcProvider;
}(ethers.providers.JsonRpcProvider));

//console.log(MyJsonRpcProvider);
exports.MyJsonRpcProvider = MyJsonRpcProvider;

var MyEtherScanRpcProvider = (function (_super) {
    __extends(MyEtherScanRpcProvider, _super);
    function MyEtherScanRpcProvider(network, apiKey) {
        var _this = this;
        _this = _super.call(this, network, apiKey);
        return _this;
    }

    MyEtherScanRpcProvider.prototype.on = function (eventName, listener) {
        var _this = this;
        let polling = this.polling;
        this._addEventListener(eventName, listener, false);
        this.polling = polling;
        //console.log("call my on fun", eventName);
        return _this;
    }

    MyEtherScanRpcProvider.prototype.once = function(eventName, listener) {
        var _this = this;
        let polling = this.polling;
        this._addEventListener(eventName, listener, true);
        this.polling = polling;
        //console.log("call my on fun", eventName);
        return _this;
    }
    return MyEtherScanRpcProvider;
}(ethers.providers.EtherscanProvider));

exports.MyEtherScanRpcProvider = MyEtherScanRpcProvider; 