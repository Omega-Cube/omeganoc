'use strict';

// Centralizes processing related to the configuration state bar, used in several of the configuration pages

define(['jquery', 'config.service'], function(jQuery, ConfigService) {
    return function() {
        jQuery('#conf-apply-changes').click(function() {
            ConfigService.apply().then(function(service_changed) {
                if(service_changed) {
                    alert('Shinken will restart with the new configuration in less than one minute.\nBe aware that you have changed some services names, if you don\'t want to lose their data you have to move them manually from /opt/graphite/storage/whisper.');
                }
                else {
                    alert('Shinken will restart with the new configuration in less than one minute.');
                }
            }).catch(function() {
                alert('An error occured while applying the changes. Maybe try again later?');
            });
        });

        jQuery('#conf-reset-changes').click(function() {
            ConfigService.reset().then(function() {
                document.location.reload();
            }).catch(function() {
                alert('An error occured during the reset operation. Maybe try again later?');
            });
        });

        jQuery('#conf-lock').click(function(){
            ConfigService.lock().then(function() {
                document.location.reload();
            }).catch(function() {
                alert('An error occured while locking the configuration. Maybe try again later?');
            });
        });
    };
});