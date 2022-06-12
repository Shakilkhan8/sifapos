"use strict";
odoo.define('pos_retail.PrinterNetwork', function (require) {

    var models = require('point_of_sale.models');
    var core = require('web.core');
    var qweb = core.qweb;
    var Printer = require('point_of_sale.Printer');
    var PrinterRetail = require('pos_retail.Printer');
    var devices = require('point_of_sale.devices');

    Printer.Printer.include({
        print_receipt: function (receipt) { // TODO: if have printer network setting
            if (receipt && this.pos.epson_printer_default) {
                console.log('Print Network now')
                this.pos.print_network(receipt, this.pos.epson_printer_default['ip'])
                return this.printResultGenerator.Successful();
            }
            return this._super(receipt)
        },
    });

    devices.ProxyDevice.include({
        keepalive: function () {
            var self = this;

            // TODO: delay 5 seconds, auto call this function for check status of all printers
            function auto_update_status_printer() {
                var printer_ips = [];
                for (var i = 0; i < self.pos.epson_printers.length; i++) {
                    printer_ips.push(self.pos.epson_printers[i]['ip'])
                }
                var params = {
                    printer_ips: printer_ips,
                };
                return self.connection.rpc("/hw_proxy/get_printers_status", params, {
                    shadow: true,
                    timeout: 2500
                }).then(function (results) {
                    var values = JSON.parse(results)['values'];
                    var online = true;
                    var pending = 0;
                    for (var printer_ip in values) {
                        if (values[printer_ip] == 'Offline') {
                            online = false;
                            pending += 1
                        }
                        var epson_printer = _.find(self.pos.epson_printers, function (printer) {
                            return printer['ip'] == printer_ip;
                        });
                        if (epson_printer) {
                            epson_printer['state'] = values[printer_ip]
                        }
                    }
                    if (online == true) {
                        self.pos.set('printer.status', {'state': 'connected', 'pending': printer_ip});
                    } else {
                        self.pos.set('printer.status', {'state': 'disconnected', 'pending': printer_ip});
                    }
                    setTimeout(auto_update_status_printer, 5000);
                }, function (error) {
                    setTimeout(auto_update_status_printer, 5000);
                    self.pos.set('printer.status', {'state': 'disconnected', 'pending': 1});
                });
            }

            if (this.pos.epson_printers.length) {
                auto_update_status_printer();
            }
            this._super();
        },
    });

    var _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {
            var base_restaurant_printer_model = this.get_model('restaurant.printer');
            base_restaurant_printer_model.fields.push('printer_id', 'printer_type', 'product_categories_ids'); // v13 called: product_categories_ids
            base_restaurant_printer_model.domain = function (self) {
                if (self.config.pos_branch_id) {
                    return [['id', 'in', self.config.printer_ids], '|', ['branch_id', '=', self.config.pos_branch_id[0]], ['branch_id', '=', null]];
                } else {
                    return [['id', 'in', self.config.printer_ids]];
                }
            };
            var _super_restaurant_printer_model_loaded = base_restaurant_printer_model.loaded;
            base_restaurant_printer_model.loaded = function (self, printers) {
                for (var i = 0; i < printers.length; i++) {
                    var printer = printers[i];
                    if (printer['printer_id'] && printer['printer_type'] == 'network') {
                        var epson_printer = self.epson_priner_by_id[printer['printer_id'][0]];
                        if (epson_printer) {
                            var categoriers = [];
                            for (var index in printer.product_categories_ids) {
                                var category_id = printer.product_categories_ids[index];
                                var category = self.pos_category_by_id[category_id];
                                if (category) {
                                    categoriers.push(category);
                                }
                            }
                            epson_printer['categoriers'] = categoriers;
                            self.epson_priner_by_id[epson_printer['id']] = epson_printer;
                            self.epson_priner_by_ip[epson_printer['ip']] = epson_printer;
                            var epson_exsited_before = _.find(self.epson_printers, function (printer) {
                                return printer['id'] == epson_printer['id']
                            });
                            if (!epson_exsited_before) {
                                self.epson_printers.push(epson_printer)
                            }
                        }
                    }
                }
                _super_restaurant_printer_model_loaded(self, printers);
            };
            _super_PosModel.initialize.apply(this, arguments);
        },
        async print_network(receipt, proxy) {
            console.log('Print direct proxy: ' + proxy);
            console.log(receipt);
            this.set('printer.status', {'state': 'connecting', 'pending': 'Printing via: ' + proxy});
            var self = this;
            var printer = _.find(this.epson_printers, function (epson_printer) {
                return epson_printer['ip'] == proxy && epson_printer['state'] == 'Online'
            });
            if (!printer) {
                return this.gui.show_popup('dialog', {
                    title: 'Warning',
                    body: 'Printer:' + proxy + ' Offline'
                })
            }
            var params = {
                receipt: receipt,
                proxy: proxy,
            };
            if (!this.proxy || !this.proxy.host) {
                return this.chrome.showPopup('ErrorPopup', {
                    title: 'Error',
                    body: 'Your pos config not setting POSBOX proxy'
                })
            }
            await this.proxy.connection.rpc("/hw_proxy/print_network", params, {
                shadow: true,
                timeout: 2500
            }, function (error) {
                console.error(error);
                self.pos.set('printer.status', {'state': 'disconnected', 'pending': 1});
            }).then(function (result) {
                console.log(result)
            })
            this.set('printer.status', {'state': 'connected', 'pending': 'Printed via: ' + proxy});
            return true;

        },
    });

    var _super_Order = models.Order.prototype;
    models.Order = models.Order.extend({
        printChanges: function () {
            var printers = this.pos.printers;
            let printerNetwork = printers.find((p) => p.printer_type == 'network')
            let printerViaPOSBOX = this.pos.config.proxy_ip && this.pos.config.iface_print_via_proxy
            if (!printerNetwork && !printerViaPOSBOX) { // todo: if pos not set proxy ip or printer network we return back odoo original
                return _super_Order.printChanges.apply(this, arguments);
            } else {
                let isPrintSuccessful = true;
                let epson_printer = null;
                for (var i = 0; i < printers.length; i++) {
                    var printer = printers[i];
                    var changes = this.computeChanges(printer.config.product_categories_ids);
                    if (changes['new'].length > 0 || changes['cancelled'].length > 0) {
                        var receipt = qweb.render('KitchenReceiptXml', {changes: changes, widget: this});
                        if (!printer.config.printer_id) {
                            printers[i].print(receipt);
                        } else {
                            var epson_printer_will_connect = this.pos.epson_priner_by_id[printer.config.printer_id[0]];
                            epson_printer = _.find(this.pos.epson_printers, function (epson_printer) {
                                return epson_printer['ip'] == epson_printer_will_connect['ip'] && epson_printer['state'] == 'Online'
                            });
                            if (epson_printer) {
                                this.pos.print_network(receipt, epson_printer['ip'])
                            }
                        }
                    }
                }
                if (!epson_printer) {
                    return _super_Order.printChanges.apply(this, arguments);
                }
                return isPrintSuccessful
            }
        },
    })
});