'use strict';

/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
 * Nicolas Lantoing, nicolas@omegacube.fr
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
define(['jquery', 'onoc.createurl'], function(jQuery, createUrl) {
    var Units = {
        units: {},
        unknown: {
            'name': 'unknown',
            'symbol': '',
            'factor': 1000,
            'magnitudes': ['','k','M','G','T']
        },
        /**
         * Format a value using unit's symbol and magnitude
         */
        unitFormat : function(value,unit){
            if(value === 'unknown') return value;
            var result = '';
            var factor = 0;
            unit = unit || this.unknown;
            if(unit.factor){
                while(value > unit.factor){
                    factor++;
                    value /= unit.factor;
                }
            }

            //round if more than 5 digits
            if(String(value).length > 5){
                if(value * 1000 > 1)
                    value = Math.round(value*1000) / 1000;
                else
                    value = value.toExponential(3);
            }

            result = value.toLocaleString() + ' ';
            if(unit.magnitudes)
                result += unit.magnitudes[factor];
            result += unit.symbol;

            return result;
        },

        /**
         * Fetch units
         * @param [callback] function - callback on success
         */
        fetchUnits: function(callback){
            var url = createUrl('/units/all');
            jQuery.get(url,function(response){
                this.units = JSON.parse(response);
                for(var unit in this.units){
                    if(this.units[unit].magnitudes)
                        this.units[unit].magnitudes = JSON.parse(this.units[unit].magnitudes);
                }
                if(callback){
                    callback(this.units);
                }
            }.bind(this));
        },

        /**
         * Return the requested unit or the unknown one if not found
         */
        get: function(name){
            return (this.units[name]) ? this.units[name] : this.unknown;
        },

        /**
         * Add new unit
         */
        add: function(name,unit){
            this.units[name] = unit;
        }
    };

    return Units;
});
