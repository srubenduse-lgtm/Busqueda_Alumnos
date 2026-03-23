# Agente Local para Cámaras Hikvision

Este es un programa en Node.js diseñado para ejecutarse en una computadora local dentro de la red del colegio (por ejemplo, en la recepción).

Su trabajo es conectarse a la base de datos en la nube (Supabase) y escuchar en tiempo real cuando un rostro o placa es reconocido. Cuando esto sucede, envía un comando local a la cámara Hikvision para que emita un pitido o abra una puerta.

## ¿Por qué usar esto?
Porque el servidor en la nube no puede conectarse directamente a la cámara local por motivos de seguridad (sin abrir puertos en el router). Este agente actúa como un puente seguro.

## Instrucciones de Instalación

1. **Instalar Node.js:** Asegúrate de que la computadora tenga instalado [Node.js](https://nodejs.org/).
2. **Abrir la terminal:** Abre una terminal (Símbolo del sistema o PowerShell en Windows) en esta carpeta (`local-agent`).
3. **Instalar dependencias:** Ejecuta el siguiente comando:
   ```bash
   npm install
   ```
4. **Configurar variables:** Copia el archivo `.env.example` y renómbralo a `.env`. Llena los datos con la IP de tu cámara, el usuario, la contraseña, y las credenciales de Supabase.
5. **Iniciar el agente:** Ejecuta el siguiente comando:
   ```bash
   npm start
   ```

El programa se quedará corriendo en segundo plano, esperando a que la nube le avise que un rostro fue aprobado.
