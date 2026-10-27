package com.onticket.app;

import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bloquea las capturas y grabaciones de pantalla (FLAG_SECURE).
 * Se activa solo mientras el cliente tiene abierta su boleta con el QR;
 * en el resto de la app las capturas funcionan normal.
 */
@CapacitorPlugin(name = "Privacidad")
public class PrivacidadPlugin extends Plugin {

    @PluginMethod
    public void activar(PluginCall call) {

        getActivity().runOnUiThread(() -> {

            getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);

            call.resolve();
        });
    }

    @PluginMethod
    public void desactivar(PluginCall call) {

        getActivity().runOnUiThread(() -> {

            getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);

            call.resolve();
        });
    }
}
