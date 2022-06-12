odoo.define('pos_retail.Chrome', function (require) {
    'use strict';

    const Chrome = require('point_of_sale.Chrome');
    const ProductsWidget = require('point_of_sale.ProductsWidget');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');
    const {Printer} = require('point_of_sale.Printer');
    var web_framework = require('web.framework');
    var core = require('web.core');
    var QWeb = core.qweb;
    var field_utils = require('web.field_utils');
    const {posbus} = require('point_of_sale.utils');

    const RetailChrome = (Chrome) =>
        class extends Chrome {
            constructor() {
                super(...arguments);
            }

            get startScreen() {
                if (this.env.pos.config.sync_multi_session && this.env.pos.config.screen_type == 'kitchen') {
                    return {name: 'KitchenScreen', props: {}};
                } else {
                    return super.startScreen;
                }
            }

            resizeImageToDataUrl(img, maxwidth, maxheight, callback) {
                img.onload = function () {
                    var canvas = document.createElement('canvas');
                    var ctx = canvas.getContext('2d');
                    var ratio = 1;

                    if (img.width > maxwidth) {
                        ratio = maxwidth / img.width;
                    }
                    if (img.height * ratio > maxheight) {
                        ratio = maxheight / img.height;
                    }
                    var width = Math.floor(img.width * ratio);
                    var height = Math.floor(img.height * ratio);

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    var dataurl = canvas.toDataURL();
                    callback(dataurl);
                };
            }

            async loadImageFile(file, callback) {
                var self = this;
                if (!file) {
                    return;
                }
                if (file.type && !file.type.match(/image.*/)) {
                    return this.pos.gui.show_popup('dialog', {
                        title: 'Error',
                        body: 'Unsupported File Format, Only web-compatible Image formats such as .png or .jpeg are supported',
                    });
                }
                var reader = new FileReader();
                reader.onload = function (event) {
                    var dataurl = event.target.result;
                    var img = new Image();
                    img.src = dataurl;
                    self.resizeImageToDataUrl(img, 600, 400, callback);
                };
                reader.onerror = function () {
                    return self.pos.gui.show_popup('dialog', {
                        title: 'Error',
                        body: 'Could Not Read Image, The provided file could not be read due to an unknown error',
                    });
                };
                await reader.readAsDataURL(file);
            }

            mounted() {
                super.mounted()
                posbus.on('hide-header', this, this.reloadScreen);
            }

            willUnmount() {
                super.willUnmount()
                posbus.off('hide-header', this);
            }

            reloadScreen() {
                this.state.hidden = true
                this.render()
            }

            _setIdleTimer() {
                // todo: odoo LISTEN EVENTS 'mousemove mousedown touchstart touchend touchmove click scroll keypress'
                // IF HAVE NOT EVENTS AUTO BACK TO FLOOR SCREEN
                return; // KIMANH
            }

            async start() {
                await super.start()
                this.env.pos.chrome = this
                this.closeOtherTabs()
                if (this.env.pos.config.restaurant_order || this.env.pos.session.restaurant_order) this.showTempScreen('RegisterScreen');
            }

            closeOtherTabs() {
                const self = this;
                // avoid closing itself
                var now = Date.now();
                localStorage['message'] = '';
                localStorage['message'] = JSON.stringify({
                    'message': 'close_tabs',
                    'config': this.env.pos.config.id,
                    'window_uid': now,
                });
                window.addEventListener("storage", function (event) {
                    var msg = event.data;

                    if (event.key === 'message' && event.newValue) {

                        var msg = JSON.parse(event.newValue);
                        if (msg.message === 'close_tabs' &&
                            msg.config == self.env.pos.config.id &&
                            msg.window_uid != now && self.env.pos.config.sync_multi_session) {
                            console.info('POS Sync multi session, 1 Tab only allow open 1 session of 1 POS config');
                            window.location = '/web#action=point_of_sale.action_client_pos_menu';
                        }
                    }

                }, false);
            }

            async _showStartScreen() {
                // when start screen, we need loading to KitchenScreen for listen event sync from another sessions
                if (this.env.pos.config.sync_multi_session && this.env.pos.config.kitchen_screen) {
                    await this.showScreen('KitchenScreen')
                }
                if (this.env.pos.config.sync_multi_session && this.env.pos.config.qrcode_order_screen) {
                    await this.showScreen('QrCodeOrderScreen')
                }
                super._showStartScreen()
            }

            async openApplication() {
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: 'Welcome to POS Retail. 1st POS Solution of Odoo',
                    body: 'Copyright (c) 2014-2020 of TL TECHNOLOGY \n' +
                        '  Email: thanhchatvn@gmail.com \n' +
                        '  Mobile: +84 902403918 \n' +
                        '  Skype: thanhchatvn'
                })
                if (confirmed) {
                    window.open('https://join.skype.com/invite/j2NiwpI0OFND', '_blank')
                }
            }

            //
            // async __showScreen({detail: {name, props = {}}}) {
            //     super.__showScreen(...arguments)
            //     if (this.env.pos.config.big_datas_sync_backend) { // todo: if bus.bus not active, when change screen we auto trigger update with backend
            //         this.env.pos.trigger('backend.request.pos.sync.datas');
            //     }
            // }

            async closingSession() {
                const self = this;
                let closing = await this.rpc({
                    model: 'pos.session',
                    method: 'close_session_and_validate',
                    args: [[this.env.pos.pos_session.id]]
                }).then(function (values) {
                    return values
                }, function (err) {
                    return self.env.pos.query_backend_fail(err)
                })
                return closing
            }

            __closePopup() {
                super.__closePopup()
                posbus.trigger('closed-popup') // i need add this event for listen event closed popup and add event keyboard back product screen
            }

            async _closePos() {
                const self = this;
                let lists = [
                    {
                        label: this.env._t('Only Close your POS Session'),
                        item: 0,
                        id: 0,
                    },
                    {
                        label: this.env._t('Logout POS Session and auto Closing Posting Entries Current Session'),
                        item: 1,
                        id: 1,
                    },
                    {
                        label: this.env._t('Logout Odoo'),
                        item: 2,
                        id: 2,
                    },
                    {
                        label: this.env._t('Logout POS Session, auto Closing Posting Entries current Session and Logout Odoo'),
                        item: 3,
                        id: 3,
                    },
                    {
                        label: this.env._t('Closing Posting Entries current Session and Print Z-Report'),
                        item: 4,
                        id: 4,
                    },
                ]
                let {confirmed, payload: item} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Please select one Close type'),
                    list: lists
                })
                if (confirmed) {
                    if (item == 0) {
                        return super._closePos()
                    }
                    if (item == 1) {
                        this.state.uiState = 'CLOSING'
                        await this.closingSession()
                        super._closePos()
                        window.location = '/web?#id=' + this.env.pos.pos_session.id + '&model=pos.session&view_type=form'
                    }
                    if (item == 2) {
                        this.state.uiState = 'CLOSING'
                        web_framework.redirect('/web/session/logout', 5000);
                        // super._closePos()
                    }
                    if (item == 3) {
                        this.state.uiState = 'CLOSING'
                        await this.closingSession()
                        web_framework.redirect('/web/session/logout', 5000);
                        // super._closePos()
                    }
                    if (item == 4) {
                        await this.closingSession()
                        let params = {
                            model: 'pos.session',
                            method: 'build_sessions_report',
                            args: [[this.env.pos.pos_session.id]],
                        };
                        let values = await this.rpc(params, {shadow: true}).then(function (values) {
                            return values
                        }, function (err) {
                            return self.env.pos.query_backend_fail(err);
                        })
                        let reportData = values[this.env.pos.pos_session.id];
                        let start_at = field_utils.parse.datetime(reportData.session.start_at);
                        start_at = field_utils.format.datetime(start_at);
                        reportData['start_at'] = start_at;
                        if (reportData['stop_at']) {
                            var stop_at = field_utils.parse.datetime(reportData.session.stop_at);
                            stop_at = field_utils.format.datetime(stop_at);
                            reportData['stop_at'] = stop_at;
                        }
                        let reportHtml = QWeb.render('ReportSalesSummarySession', {
                            pos: this.env.pos,
                            report: reportData,
                        });
                        this.showScreen('ReportScreen', {
                            report_html: reportHtml
                        });
                        let {confirmed} = await this.showPopup('ConfirmPopup', {
                            title: this.env._t('Alert'),
                            body: this.env._t('Are you want POS auto closing after 10 seconds from now ?')
                        })
                        setTimeout(function () {
                            window.location = '/web#action=point_of_sale.action_client_pos_menu';
                        }, 10000)
                    }

                }
            }
        }
    Registries.Component.extend(Chrome, RetailChrome);

    return RetailChrome;
});
