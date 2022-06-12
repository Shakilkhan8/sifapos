odoo.define('pos_retail.HeaderLockButton', function (require) {
    'use strict';

    const HeaderLockButton = require('point_of_sale.HeaderLockButton');
    const Registries = require('point_of_sale.Registries');

    const RetailHeaderLockButton = (HeaderLockButton) =>
        class extends HeaderLockButton {
            async showLoginScreen() {
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Hi, Are you want Close and Post Entries your POS Session now ?'),
                    body: this.env._t('If you wanted Close and Post Entries click OK button, else click CANCEL button for Lock this screen!!!')
                })
                if (confirmed) {
                    let closing = await this.env.pos.chrome.closingSession();
                    this.env.pos.alert_message({
                        title: this.env._t('Great Job'),
                        body: this.env._t('We just closed and posted entries your Session'),
                        color: 'success'
                    })
                    await this.showTempScreen('LoginScreen');
                } else {
                    await this.showTempScreen('LoginScreen');
                }

            }
        }
    Registries.Component.extend(HeaderLockButton, RetailHeaderLockButton);

    return RetailHeaderLockButton;
});
