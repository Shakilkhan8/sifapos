odoo.define('pos_retail.PopUpCreateSaleOrder', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const PosComponent = require('point_of_sale.PosComponent');
    const contexts = require('point_of_sale.PosContext');
    var core = require('web.core');
    var _t = core._t;

    class PopUpCreateSaleOrder extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            let order = this.props.order;
            let client = order.get_client();
            this.state = useState({
                order: order,
            });
            this.changes = {
                delivery_phone: client.mobile || client.phone,
                delivery_address: order.delivery_address || client.address,
                delivery_date: this.props.delivery_date || order.delivery_date,
                note: order.note,
                signature: null,
                payment_partial_amount: 0,
                payment_partial_method_id: this.env.pos.normal_payment_methods[0].id,
                pricelist_id: order.pricelist.id,
                sale_order_auto_confirm: this.env.pos.config.sale_order_auto_confirm,
                sale_order_auto_invoice: this.env.pos.config.sale_order_auto_invoice,
                sale_order_auto_delivery: this.env.pos.config.sale_order_auto_delivery,
            }
            this.orderUiState = useContext(contexts.orderManagement);
        }

        mounted() {
            var self = this;
            // $(this.el).find('.datetimepicker').datetimepicker({
            //     format: 'YYYY-MM-DD HH:mm:00',
            //     icons: {
            //         time: "fa fa-clock-o",
            //         date: "fa fa-calendar",
            //         up: "fa fa-chevron-up",
            //         down: "fa fa-chevron-down",
            //         previous: 'fa fa-chevron-left',
            //         next: 'fa fa-chevron-right',
            //         today: 'fa fa-screenshot',
            //         clear: 'fa fa-trash',
            //         close: 'fa fa-remove'
            //     }
            // }).on("dp.change", function (event) {
            //     self.OnChange(event)
            // });
            $(this.el).find(".signature").jSignature();
            this.signed = false;
            $(this.el).find(".signature").bind('change', function (e) {
                self.signed = true;
                self.verifyChanges();
            });
        }

        OnChange(event) {
            let target_name = event.target.name;
            if (event.target.type == 'checkbox') {
                this.changes[event.target.name] = event.target.checked;
            } else {
                this.changes[event.target.name] = event.target.value;
            }
            if (target_name == 'payment_partial_amount') {
                this.changes[event.target.name] = parseFloat(this.changes[event.target.name]);
            }
            this.verifyChanges()
        }

        verifyChanges() {
            let changes = this.changes;
            if (changes.delivery_phone == '') {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = _t('Phone is required')
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = _t('Phone is valid')
            }
            if (changes.delivery_address == '') {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = _t('Phone is required')
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = _t('Phone is valid');
            }
            if (changes.delivery_date == '') {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = _t('Delivery Date is required');
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = _t('Delivery Date is valid')
            }
            if (changes.payment_partial_amount < 0) {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = _t('Partial Amount required bigger than or equal 0');
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = _t('Partial Amount is valid')
            }
            var sign_datas = $(this.el).find(".signature").jSignature("getData", "image");
            if (sign_datas && sign_datas[1] && this.signed) {
                changes['signature'] = sign_datas[1];
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = _t('Signature succeed')
            } else {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = _t('Please Signature');
                return;
            }
        }

        getPayload() {
            this.verifyChanges();
            if (this.orderUiState.isSuccessful) {
                return {
                    values: this.changes
                };
            } else {
                return {
                    values: {},
                    error: this.orderUiState.hasNotice
                };
            }

        }
    }

    PopUpCreateSaleOrder.template = 'PopUpCreateSaleOrder';
    PopUpCreateSaleOrder.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpCreateSaleOrder);

    return PopUpCreateSaleOrder
});
