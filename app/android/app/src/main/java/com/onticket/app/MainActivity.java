package com.onticket.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {

        // plugin propio: bloquear capturas de pantalla en la boleta (QR)
        registerPlugin(PrivacidadPlugin.class);

        super.onCreate(savedInstanceState);
    }
}
