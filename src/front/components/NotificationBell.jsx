// src/front/components/NotificationBell.jsx
import React, { useEffect } from "react";
// 1. Importamos el reducer global, no un hook de notificaciones inexistente
import useGlobalReducer from "../hooks/useGlobalReducer.jsx";
// 2. Importamos las acciones que ya escribimos en tu store.js

export const NotificationBell = () => {
    // 3. Obtenemos el store y el dispatch de nuestra fuente global
    const { store, dispatch } = useGlobalReducer();

    // 4. Cargamos las notificaciones cuando el componente aparece (y solo si hay token)
    useEffect(() => {
        if (store.token) {
            getNotifications(dispatch);
        }
    }, [store.token]);

    return (
        <div className="nav-item dropdown px-2">
            <button 
                className="btn position-relative bg-transparent border-0 text-white" 
                type="button" 
                data-bs-toggle="dropdown" 
                aria-expanded="false"
            >
                <i className="fas fa-bell fs-5"></i>
                
                {/* Burbuja roja con el contador (leemos de store.unreadCount) */}
                {store.unreadCount > 0 && (
                    <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                        {store.unreadCount}
                    </span>
                )}
            </button>
            
            <ul className="dropdown-menu dropdown-menu-end shadow" style={{ width: "320px", maxHeight: "400px", overflowY: "auto" }}>
                <li><h6 className="dropdown-header fw-bold">Tus Notificaciones</h6></li>
                
                {/* Leemos el arreglo de notificaciones de nuestro store global */}
                {!store.notifications || store.notifications.length === 0 ? (
                    <li>
                        <span className="dropdown-item text-muted text-center py-3">
                            No tienes notificaciones nuevas
                        </span>
                    </li>
                ) : (
                    store.notifications.map((notif) => (
                        <li key={notif.id} className="dropdown-item d-flex justify-content-between align-items-center text-wrap border-bottom" style={{ whiteSpace: "normal" }}>
                            <span className="me-3" style={{ fontSize: "0.9rem" }}>
                                {notif.message}
                            </span>
                            <button 
                                className="btn btn-sm btn-outline-success p-1"
                                onClick={(e) => {
                                    e.stopPropagation(); 
                                    // Llamamos a la acción de tu store.js
                                    markAsRead(notif.id, dispatch);
                                }}
                                title="Marcar como leída"
                            >
                                <i className="fas fa-check"></i>
                            </button>
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
};