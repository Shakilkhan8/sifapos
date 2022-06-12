# -*- coding: utf-8 -*-
from odoo import api, fields, models, tools, _
from odoo.exceptions import UserError

class res_users(models.Model):
    _inherit = "res.users"

    pos_config_id = fields.Many2one('pos.config', 'Pos Config')
    pos_delete_order = fields.Boolean('Delete POS Orders', default=0)
    pos_security_pin = fields.Integer(string='Security PIN',
                                   help='A Security PIN used to protect sensible functionality in the Point of Sale')
    pos_branch_id = fields.Many2one(
        'pos.branch',
        string='Branch Assigned',
        help='This is branch default for any records data create by this user'
    )
    allow_access_backend = fields.Boolean('Allow Access Backend', default=1)
