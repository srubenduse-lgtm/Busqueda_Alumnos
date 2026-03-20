export interface School {
  id: string;
  name: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'superUser' | 'admin';
  school_id?: string;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
  photoUrl?: string;
  guardianIds: string[];
  school_id?: string;
}

export interface Guardian {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string;
  licensePlatePhotoUrl?: string;
  vehicleModel: string;
  licensePlate: string;
  studentIds: string[];
  school_id?: string;
}

export interface Pickup {
  id: string;
  studentId: string;
  guardianId: string;
  timestamp: string;
  status: 'pending' | 'announced' | 'completed';
  school_id?: string;
}

export interface CameraLog {
  id: string;
  created_at: string;
  event_type: 'plate' | 'face' | 'unknown';
  content: string;
  matched: boolean;
  guardian_id?: string;
  details?: string;
  school_id?: string;
}
