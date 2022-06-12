odoo.define('pos_retail.LoginScreen', function (require) {
    'use strict';

    const LoginScreen = require('pos_hr.LoginScreen');
    const Registries = require('point_of_sale.Registries');

    const RetailLoginScreen = (LoginScreen) =>
        class extends LoginScreen {
            async selectCashier() {
                if (this.env.pos.config.multi_session) {
                    const list = this.env.pos.employees.map((employee) => {
                        return {
                            id: employee.id,
                            item: employee,
                            label: employee.name,
                            isSelected: false,
                        };
                    });

                    const employee = await this.selectEmployee(list);
                    if (this.env.pos.config.multi_session_login_pin && !employee.pin) {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Error !!!'),
                            body: employee.name + this.env._t(' missed setting Pin. Please go to Hr Setting of this Employee and set Pin Code !!!')
                        })
                    }
                    if (employee) {
                        let sessionValue = await this.rpc({
                            model: 'pos.session',
                            method: 'get_session_by_employee_id',
                            args: [[], employee.id, this.env.pos.config.id],
                            context: {
                                pos: true
                            }
                        })
                        let sessionState = sessionValue.state
                        this.env.pos.pos_session = sessionValue.session
                        this.env.pos.login_number = sessionValue.login_number + 1
                        this.env.pos.set_cashier(employee);
                        this.env.pos.db.save('pos_session_id', this.env.pos.pos_session.id);
                        this.back();
                    }
                } else {
                    super.selectCashier()
                }
            }

            async _barcodeCashierAction(code) {
                if (this.env.pos.config.multi_session) {
                    this.selectCashier()
                } else {
                    super._barcodeCashierAction(code)
                }
            }
        }
    Registries.Component.extend(LoginScreen, RetailLoginScreen);

    return RetailLoginScreen;
});
