import { UserRole } from '@nexhire/shared';
import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { UserRoleEntity } from './user-role.entity';

@Entity('roles')
@Index('uq_roles_name', ['name'], { unique: true })
export class Role {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_roles_id' })
  id: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role_enum',
  })
  name: UserRole;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => UserRoleEntity, (userRole) => userRole.role)
  userRoles: UserRoleEntity[];
}
