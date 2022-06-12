# -*- coding: utf-8 -*-
from odoo import api, fields, models, _

class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    fullfill_amount = fields.Boolean(
        'Full fill Amount',
        help='If checked, when cashier click to this Payment Method \n'
             'Payment line auto full fill amount due'
    )

