odoo.define('pos_retail.Printer', function (require) {
    var Printer = require('point_of_sale.Printer');
    var core = require('web.core');
    var _t = core._t;

    Printer.Printer.include({
        _onIoTActionResult: function (data) {
            try {
                this._super(data)
            } catch (e) {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Error'),
                    body: _t('Your POS connection lose to Kitchen Printer, please your pos profile or your internet connection')
                })
            }
        },
        print_receipt: function (receipt) { // TODO: if proxy_id is added, it meaning posbox installed else it meaning iotbox
            if (receipt) {
                console.log('Print Receipt')
                console.log(receipt);
            }
            if (!this.pos.config.iface_printer_id && this.pos.config.proxy_ip && this.pos.config.iface_print_via_proxy && receipt) {
                if (this.pos.config.duplicate_receipt && this.pos.config.duplicate_number > 1) {
                    for (var i = 0; i < this.pos.config.duplicate_number; i++) {
                        this.print_direct_receipt(receipt);
                    }
                } else {
                    this.print_direct_receipt(receipt);
                }
                return this.printResultGenerator.Successful();
            }
            if (this.pos.config.duplicate_receipt && this.pos.config.duplicate_number > 1) {
                for (var i = 0; i < this.pos.config.duplicate_number; i++) {
                    this._super(receipt)
                }
            } else {
                return this._super(receipt)
            }
        },
        async print_direct_receipt (receipt) {
            this.pos.set('printer.status', {'state': 'connecting', 'pending': 'Print via POSBOX'});
            await this.connection.rpc('/hw_proxy/print_xml_receipt', {
                receipt: receipt,
            });
            this.pos.set('printer.status', {'state': 'connected', 'pending': 'Printed'});
        },
        open_cashbox: function () {
            if (this.pos.config.proxy_ip) {
                return this.connection.rpc('/hw_proxy/open_cashbox', {}).then(function (result) {
                    console.log('POS Box 17 open cashbox');
                })
            } else {
                this._super();
            }
        },
        send_printing_job: function (img) {
            if (this.pos.config.proxy_ip) {
                return false
            } else {
                this._super();
            }
        },
    });

})
;
