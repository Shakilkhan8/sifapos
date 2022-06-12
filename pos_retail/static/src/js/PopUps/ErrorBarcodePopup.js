odoo.define('pos_retail.ErrorBarcodePopup', function (require) {
    'use strict';

    const ErrorBarcodePopup = require('point_of_sale.ErrorBarcodePopup');
    const Registries = require('point_of_sale.Registries');

    const RetailErrorBarcodePopup = (ErrorBarcodePopup) =>
        class extends ErrorBarcodePopup {
            async createNewProduct() {
                const code = this.props.code;
                let {confirmed, payload: results} = await this.showPopup('PopUpCreateProduct', {
                    title: this.env._t('Create new Product'),
                    barcode: code
                })
                if (confirmed && results) {
                    let value = {
                        name: results.name,
                        list_price: results.list_price,
                        default_code: results.default_code,
                        barcode: results.barcode,
                        standard_price: results.standard_price,
                        type: results.type,
                        available_in_pos: true
                    }
                    if (results.pos_categ_id != 'null') {
                        value['pos_categ_id'] = results['pos_categ_id']
                    }
                    if (results.image_1920) {
                        value['image_1920'] = results.image_1920.split(',')[1];
                    }
                    this.rpc({
                        model: 'product.product',
                        method: 'create',
                        args: [value]
                    })
                }
            }
        }
    Registries.Component.extend(ErrorBarcodePopup, RetailErrorBarcodePopup);

    return RetailErrorBarcodePopup;
});
