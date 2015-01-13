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
define(['onoc.createurl'], function(createUrl) {
    var Units = {
        units: {},
        /**
         * Format a value using unit's symbol and magnitude
         */
        unitFormat : function(value,unit){
            if(value === 'unknown') return value;
            var result = "";
            var factor = 0;
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

            result = value;
            if(unit.magnitudes)
                result += unit.magnitudes[factor];
            result += unit.symbol;

            return result;
        },

        /**
         * Fetch units
         */
        fetchUnits: function(){
            var url = createUrl('/units/all');
            jQuery.get(url,function(response){
                this.units = JSON.parse(response);
                for(var unit in this.units){
                    if(this.units[unit].magnitudes)
                        this.units[unit].magnitudes = JSON.parse(this.units[unit].magnitudes);
                }
            }.bind(this));
        }
    };

    return Units;
});
