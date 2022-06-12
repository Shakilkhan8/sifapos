odoo.define('pos_retail.ProxyStatus', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProxyStatus = require('point_of_sale.ProxyStatus');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    const RetailProxyStatus = (ProxyStatus) =>
        class extends ProxyStatus {
            constructor() {
                super(...arguments);
            }

            _setStatus(newStatus) {
                if (!this.env.pos.config.proxy_ip && this.env.pos.config.iface_print_via_proxy) {
                    return super._setStatus(newStatus);
                }
                if (newStatus.status === 'connected') {
                    var warning = false;
                    var msg = '';
                    if (this.env.pos.config.iface_scan_via_proxy) {
                        var scannerStatus = newStatus.drivers.scanner
                            ? newStatus.drivers.scanner.status
                            : false;
                        if (scannerStatus != 'connected' && scannerStatus != 'connecting') {
                            warning = true;
                            msg += this.env._t('Scanner');
                        }
                    }
                    if (
                        this.env.pos.config.iface_print_via_proxy ||
                        this.env.pos.config.iface_cashdrawer
                    ) {
                        var printerStatus = newStatus.drivers.printer
                            ? newStatus.drivers.printer.status
                            : false;
                        if (!printerStatus && newStatus.drivers.escpos && newStatus.drivers.escpos['status']) {
                            printerStatus = newStatus.drivers.escpos ? newStatus.drivers.escpos.status : false;
                        }
                        if (printerStatus != 'connected' && printerStatus != 'connecting') {
                            warning = true;
                            msg = msg ? msg + ' & ' : msg;
                            msg += this.env._t('Printer');
                        }
                    }
                    if (this.env.pos.config.iface_electronic_scale) {
                        var scaleStatus = newStatus.drivers.scale
                            ? newStatus.drivers.scale.status
                            : false;
                        if (scaleStatus != 'connected' && scaleStatus != 'connecting') {
                            warning = true;
                            msg = msg ? msg + ' & ' : msg;
                            msg += this.env._t('Scale');
                        }
                    }
                    msg = msg ? msg + ' ' + this.env._t('Offline') : msg;

                    this.state.status = warning ? 'warning' : 'connected';
                    this.state.msg = msg;
                } else {
                    this.state.status = newStatus.status;
                    this.state.msg = newStatus.msg || '';
                }
            }
        }
    Registries.Component.extend(ProxyStatus, RetailProxyStatus);

    return RetailProxyStatus;
});
